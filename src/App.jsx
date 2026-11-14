import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, ListGroup, Tab, Navbar, Dropdown, Form, FormControl, Modal, Button } from 'react-bootstrap';
import Database from '@tauri-apps/plugin-sql';
import { exists, BaseDirectory, remove } from '@tauri-apps/plugin-fs';
import { download } from '@tauri-apps/plugin-upload';
import { appDataDir, join } from '@tauri-apps/api/path';
import { fetch } from '@tauri-apps/plugin-http';
import { invoke } from '@tauri-apps/api/core';

const DB_URL = "https://huggingface.co/datasets/ahashanahmed/tafsir/resolve/main/tafsir.db";

const highlightText = (text, query) => {
  if (!text) return "";
  if (!query || query.trim() === "") return text;
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, index) => 
    regex.test(part) ? (
      <mark key={index} style={{ backgroundColor: '#ffeb3b', padding: '0 2px', borderRadius: '3px', color: '#000' }}>
        {part}
      </mark>
    ) : ( part )
  );
};

export default function App() {
  const [selectedBook, setSelectedBook] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [db, setDb] = useState(null);
  const [booksData, setBooksData] = useState([]);
  const [quransData, setQuransData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("অ্যাপ চালু হচ্ছে...");
  const [errorMsg, setErrorMsg] = useState(null);

  // ✅ লেখক পরিচিতি মডালের জন্য স্টেট
  const [showModal, setShowModal] = useState(false);
  const [modalContent, setModalContent] = useState({ title: "", body: "" });

  useEffect(() => {
    async function initDb() {
      try {
        const dbExists = await exists('tafsir.db', { baseDir: BaseDirectory.AppData });
        
        if (!dbExists) {
          setLoadingMsg("সার্ভার থেকে সাইজ চেক করা হচ্ছে...");
          
          const appData = await appDataDir();
          const dbPath = await join(appData, 'tafsir.db');
          
          let totalFileSize = 0;
          try {
            const headResponse = await fetch(DB_URL, { method: 'HEAD' });
            const contentLength = headResponse.headers.get('content-length');
            if (contentLength) {
              totalFileSize = parseInt(contentLength, 10);
            }
          } catch (err) {}

          if (totalFileSize === 0) totalFileSize = 133 * 1024 * 1024;

          setLoadingMsg("প্রথমবার ডেটাবেস ডাউনলোড হচ্ছে...");

          const intervalId = setInterval(async () => {
            try {
              const downloaded = await invoke('get_file_size', { path: dbPath });
              if (downloaded > 0) {
                const percent = Math.min(Math.round((downloaded / totalFileSize) * 100), 100);
                const mbDownloaded = (downloaded / (1024 * 1024)).toFixed(2);
                const mbTotal = (totalFileSize / (1024 * 1024)).toFixed(2);
                setLoadingMsg(`ডাউনলোড হচ্ছে: ${percent}% (${mbDownloaded} MB / ${mbTotal} MB)`);
              }
            } catch (e) {}
          }, 1000);

          try {
            await download(DB_URL, dbPath);
          } finally {
            clearInterval(intervalId);
          }
          
          setLoadingMsg("ডাউনলোড সম্পন্ন! লোড হচ্ছে...");
        } else {
          setLoadingMsg("ডেটাবেস লোড হচ্ছে...");
        }

        const database = await Database.load('sqlite:tafsir.db');
        setDb(database);
        
        const books = await database.select('SELECT * FROM books');
        setBooksData(books);

        const initialQurans = await database.select('SELECT * FROM qurans LIMIT 50');
        setQuransData(initialQurans);

      } catch (error) {
        console.error("DB Error:", error);
        setErrorMsg(error.toString() || "Unknown Database Error");
        try {
          await remove('tafsir.db', { baseDir: BaseDirectory.AppData });
        } catch (e) {}
      } finally {
        setLoading(false);
      }
    }
    initDb();
  }, []);

  useEffect(() => {
    if (!db) return;
    async function fetchFilteredData() {
      let query = 'SELECT * FROM qurans WHERE 1=1';
      const params = [];
      if (selectedBook) {
        query += ' AND book = ?';
        params.push(selectedBook);
      }
      if (searchQuery.trim() !== '') {
        query += ' AND (verses LIKE ? OR name LIKE ? OR summary LIKE ? OR ancillary_issue LIKE ?)';
        const searchParam = `%${searchQuery}%`;
        params.push(searchParam, searchParam, searchParam, searchParam);
      }
      query += ' LIMIT 100'; 
      try {
        const results = await db.select(query, params);
        setQuransData(results);
      } catch (err) {
        console.error("Search error:", err);
      }
    }
    fetchFilteredData();
  }, [selectedBook, searchQuery, db]);

  // ✅ মডাল ওপেন করার ফাংশন
  const handleShowIntro = (bookTitle, introText) => {
    setModalContent({ title: bookTitle, body: introText });
    setShowModal(true);
  };

  if (loading) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center vh-100 bg-dark text-white text-center p-4">
        <h4>{loadingMsg}</h4>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="p-4 bg-dark text-white vh-100">
        <h3 className="text-danger">ডেটাবেস এরর!</h3>
        <div className="bg-secondary p-3 rounded mt-3" style={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>
          {errorMsg}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Navbar sticky="top" className="bg-warning px-3">
        <Container fluid>
          {/* ✅ সার্চ করার সময় ড্রপডাউন লুকিয়ে যাবে (আগের মেসেজ অনুযায়ী) */}
          {searchQuery.trim() === "" && (
            <Dropdown>
              <Dropdown.Toggle variant="success" id="dropdown-basic">
                {selectedBook ? selectedBook : "সব বই"}
              </Dropdown.Toggle>
              <Dropdown.Menu style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <Dropdown.Item onClick={() => setSelectedBook(null)}>সব বই</Dropdown.Item>
                {booksData.map((b, i) => (
                  <div key={i} className="d-flex justify-content-between align-items-center px-2 py-1 dropdown-item-custom">
                    <span 
                      onClick={() => setSelectedBook(b.book)} 
                      style={{ cursor: 'pointer', flex: 1 }}
                    >
                      {b.book}
                    </span>
                    {/* ✅ লেখক পরিচিতি দেখার আইকন */}
                    <Button 
                      variant="outline-info" 
                      size="sm" 
                      className="ms-2 py-0 px-2"
                      onClick={(e) => {
                        e.stopPropagation(); // ড্রপডাউন বন্ধ হওয়া রোধ করতে
                        handleShowIntro(b.book, b.Author_Introduction);
                      }}
                    >
                      ℹ️
                    </Button>
                  </div>
                ))}
              </Dropdown.Menu>
            </Dropdown>
          )}

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
        {/* ✅ আগের "বইয়ের পরিচিতি" সেকশনটি সরিয়ে দেওয়া হয়েছে, কারণ এটি এখন মডালে দেখাবে */}

        <Row>
          <Col>
            {quransData.length === 0 ? (
              <div className="text-center mt-5 bg-dark text-white py-4">
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

      {/* ✅ লেখক পরিচিতি দেখানোর জন্য Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg" centered scrollable>
        <Modal.Header closeButton className="bg-dark text-white">
          <Modal.Title>{modalContent.title} - লেখক পরিচিতি</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ whiteSpace: "pre-wrap", fontSize: "15px", backgroundColor: "#f8f9fa", color: "#000" }}>
          {modalContent.body}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            বন্ধ করুন
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
