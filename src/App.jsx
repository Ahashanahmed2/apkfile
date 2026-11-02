import React, { useState } from 'react';
import { Container, Row, Col, Card, ListGroup, Tab, Navbar, Dropdown, Form, FormControl } from 'react-bootstrap';
import booksData from './data/books.json';
import quransData from './data/qurans.json';

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

  // সার্চ ফিল্টার লজিক
  const filteredQurans = quransData.filter(q => {
    const matchBook = selectedBook ? q.book === selectedBook : true;
    const matchSearch = 
      q.verses.includes(searchQuery) || 
      q.name.includes(searchQuery) || 
      q.summary.includes(searchQuery) ||
      (q.ancillary_issue && q.ancillary_issue.includes(searchQuery));
    return matchBook && matchSearch;
  });

  return (
    <div>
      {/* টপ বার */}
      <Navbar sticky="top" className="bg-warning px-3">
        <Container fluid>
          <Dropdown>
            <Dropdown.Toggle variant="success" id="dropdown-basic">
              {selectedBook ? selectedBook : "সব বই"}
            </Dropdown.Toggle>
            <Dropdown.Menu>
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
            {filteredQurans.map((item, index) => (
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
            ))}
          </Col>
        </Row>
      </Container>
    </div>
  );
}
