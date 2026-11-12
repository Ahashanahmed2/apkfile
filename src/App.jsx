import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, ListGroup, Tab, Navbar, Dropdown, Form, FormControl } from 'react-bootstrap';
import Database from '@tauri-apps/plugin-sql';

// সার্চের শব্দ হাইলাইট করার ফাংশন
const highlightText = (text, query) => {
  if (!text) return "";
  if (!query || query.trim() === "") return text;

  // ইউজার যা লিখেছে তার থেকে স্পেশাল ক্যারেক্টার মুছে ফেলা (যাতে regex ভাঙে না)
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  
  // টেক্সটকে ভেঙে ভেঙে খোঁজা এবং ম্যাচ পেলে <mark> ট্যাগ দেওয়া
  const parts = text.split(regex);
  
  return parts.map((part, index) => 
    regex.test(part) ? (
      <mark key={index} style={{ backgroundColor: '#ffeb3b', padding: '0 2px', borderRadius: '3px', color: '#000' }}>
        {part}
      </mark>
    ) : (
      part
    )
  );
};

export default function App() {
  const [selectedBook, setSelectedBook] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  // ডেটাবেসের জন্য নতুন স্টেট
  const [db, setDb] = useState(null);
  const [booksData, setBooksData] = useState([]);
  const [quransData, setQuransData] = useState([]);
  const [loading, setLoading] = useState(true);

  // ১. অ্যাপ চালু হলে ডেটাবেস কানেক্ট এবং প্রাথমিক ডেটা লোড করা
  useEffect(() => {
    async function initDb() {
      try {
        // ডেটাবেস লোড (Rust সাইডে ফাইলটি AppData-তে কপি হয়ে থাকবে)
        const database = await Database.load('sqlite:tafsir.db');
        setDb(database);

        // বইয়ের তালিকা লোড করা (ড্রপডাউনের জন্য)
        const books = await database.select('SELECT * FROM books');
        setBooksData(books);

        // প্রাথমিকভাবে প্রথম ৫০টি তাফসির লোড করা (সব একসাথে না করে)
        const initialQurans = await database.select('SELECT * FROM qurans LIMIT 50');
        setQuransData(initialQurans);
        
      } catch (error) {
        console.error("ডেটাবেস লোড করতে সমস্যা হয়েছে:", error);
      } finally {
        setLoading(false);
      }
    }
    
    initDb();
  }, []);

  // ২. সার্চ এবং ফিল্টার লজিক (ডেটাবেসে কুয়েরি করে)
  useEffect(() => {
    if (!db) return; // ডেটাবেস রেডি না হলে কিছু করবে না

    async function fetchFilteredData() {
      let query = 'SELECT * FROM qurans WHERE 1=1';
      const params = [];

      // যদি নির্দিষ্ট কোনো বই সিলেক্ট করা থাকে
      if (selectedBook) {
        query += ' AND book = ?';
        params.push(selectedBook);
      }

      // যদি সার্চ বক্সে কিছু লেখা থাকে
      if (searchQuery.trim() !== '') {
        query += ' AND (verses LIKE ? OR name LIKE ? OR summary LIKE ? OR ancillary_issue LIKE ?)';
        const searchParam = `%${searchQuery}%`;
        params.push(searchParam, searchParam, searchParam, searchParam);
      }

      // পারফরম্যান্সের জন্য একসাথে ১০০টির বেশি রেজাল্ট লোড না করা
      query += ' LIMIT 100'; 

      try {
        const results = await db.select(query, params);
        setQuransData(results);
      } catch (err) {
        console.error("সার্চ করতে সমস্যা হয়েছে:", err);
      }
    }

    fetchFilteredData();
  }, [selectedBook, searchQuery, db]);

  // ৩. লোডিং স্ক্রিন (যখন ডেটা আসতে সময় নিচ্ছে)
  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <h4>ডেটা লোড হচ্ছে... অনুগ্রহ করে অপেক্ষা করুন।</h4>
      </div>
    );
  }

  return (
    <div>
      {/* টপ বার */}
      <Navbar sticky="top" className="bg-warning px-3">
        <Container fluid>
          <Dropdown>
            <Dropdown.Toggle variant="success" id="dropdown-basic">
              {selectedBook ? selectedBook : "সব বই"}
            </Dropdown.Toggle>
            <Dropdown.Menu style={{ maxHeight: '300px', overflowY: 'auto' }}>
              <Dropdown.Item onClick={() => setSelectedBook(null)}>সব বই</Dropdown.Item>
              {booksData.map((b, i) => (
                <Dropdown.Item key={i} onClick={() => setSelectedBook(b.book)}>
                  {b.book}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>

          <Form className="d-flex w-50">
            <FormControl
              type="search"
              placeholder="কুরআন থেকে সার্চ করুন..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </Form>
        </Container>
      </Navbar>

      <Container fluid className="mt-3">
        {/* বইয়ের পরিচিতি */}
        {selectedBook && (
          <Row className="mb-4">
            <Col>
              {booksData.filter(b => b.book === selectedBook).map((book, idx) => (
                <Card key={idx} className="mb-3 shadow-sm" bg="light" text="dark">
                  <Card.Header className="bg-dark text-white text-center">{book.book} - লেখক পরিচিতি</Card.Header>
                  <Card.Body style={{ whiteSpace: "pre-wrap", fontSize: "15px", color: "#000000", backgroundColor: "#f8f9fa" }}>
                    {highlightText(book.Author_Introduction, searchQuery)}
                  </Card.Body>
                </Card>
              ))}
            </Col>
          </Row>
        )}

        {/* কুরআনের আয়াত ও তাফসীর লিস্ট */}
        <Row>
          <Col>
            {quransData.length === 0 ? (
              <div className="text-center mt-5">
                <h5>কোনো ফলাফল পাওয়া যায়নি!</h5>
              </div>
            ) : (
              quransData.map((item, index) => (
                <Card key={index} className="mb-3 shadow-sm" bg="light" text="dark" border="secondary">
                  <Card.Header className="d-flex justify-content-between bg-dark text-white">
                    <span>{item.book}</span>
                    <span>{item.name} ({item.number})</span>
                  </Card.Header>
                  <Card.Body style={{ backgroundColor: "#f8f9fa" }}>
                    <div className="bg-secondary text-light p-2 mb-3 rounded" style={{ whiteSpace: "pre-wrap", fontSize: "18px" }}>
                      {highlightText(item.verses, searchQuery)}
                      <span className="badge bg-warning text-dark ms-2 mt-2 d-inline-block">
                        [{item.name} - {item.number}:{item.versesNumber}]
                      </span>
                    </div>

                    <Tab.Container id="left-tabs-example" defaultActiveKey="first">
                      <Row>
                        <Col sm={4}>
                          <ListGroup>
                            <ListGroup.Item action eventKey="first" className="text-dark">সারসংক্ষেপ</ListGroup.Item>
                            <ListGroup.Item action eventKey="second" className="text-dark">আনুষঙ্গিক বিষয়</ListGroup.Item>
                          </ListGroup>
                        </Col>
                        <Col sm={8}>
                          <Tab.Content>
                            <Tab.Pane eventKey="first">
                              <div style={{ whiteSpace: "pre-wrap", fontSize: "15px", color: "#000000" }}>
                                {highlightText(item.summary, searchQuery)}
                              </div>
                            </Tab.Pane>
                            <Tab.Pane eventKey="second">
                              <div style={{ whiteSpace: "pre-wrap", fontSize: "15px", color: "#000000" }}>
                                {highlightText(item.ancillary_issue || "কোন তথ্য নেই", searchQuery)}
                              </div>
                            </Tab.Pane>
                          </Tab.Content>
                        </Col>
                      </Row>
                    </Tab.Container>
                  </Card.Body>
                </Card>
              ))
            )}
          </Col>
        </Row>
      </Container>
    </div>
  );
}