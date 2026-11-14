import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, ListGroup, Tab, Navbar, Dropdown, Form, FormControl, Modal, Button } from 'react-bootstrap';
import Database from '@tauri-apps/plugin-sql';
import { exists, BaseDirectory, remove } from '@tauri-apps/plugin-fs';
import { download } from '@tauri-apps/plugin-upload';
import { appDataDir, join } from '@tauri-apps/api/path';
import { fetch } from '@tauri-apps/plugin-http';
import { invoke } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

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

  const [showModal, setShowModal] = useState(false);
  const [modalContent, setModalContent] = useState({ title: "", body: "" });

  const [savedItems, setSavedItems] = useState([]);
  const [showSavedModal, setShowSavedModal] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('savedTafsir');
    if (saved) {
      setSavedItems(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    async function initDb() {
      try {
        const dbExists = await exists('tafsir.db', { baseDir: BaseDirectory.AppData });
        
        if (!dbExists) {
          setLoadingMsg("প্রথমবার ডেটাবেস ডাউনলোড হচ্ছে...");
          const appData = await appDataDir();
          const dbPath = await join(appData, 'tafsir.db');
          
          let totalFileSize = 0;
          try {
            const headResponse = await fetch(DB_URL, { method: 'HEAD' });
            const contentLength = headResponse.headers.get('content-length');
            if (contentLength) totalFileSize = parseInt(contentLength, 10);
          } catch (err) {}

          if (totalFileSize === 0) totalFileSize = 133 * 1024 * 1024;

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

  const handleCopy = async (text) => {
    try {
      await writeText(text);
      alert("সফলভাবে কপি করা হয়েছে!");
    } catch (e) {
      alert("কপি করতে সমস্যা হয়েছে!");
    }
  };

  const handleSave = (item, type, content) => {
    if (!content) {
      alert("সেভ করার জন্য কোনো তথ্য নেই!");
      return;
    }

    const newItem = {
      id: item._id,
      book: item.book,
      name: item.name,
      number: item.number,
      type: type,
      content: content
    };

    const exists = savedItems.find(i => i.id === newItem.id && i.type === newItem.type);
    if (exists) {
      alert("এটি ইতিমধ্যে সেভ করা আছে!");
      return;
    }

    const updated = [...savedItems, newItem];
    setSavedItems(updated);
    localStorage.setItem('savedTafsir', JSON.stringify(updated));
    alert("সফলভাবে সেভ করা হয়েছে!");
  };

  const handleDeleteSaved = (index) => {
    const updated = savedItems.filter((_, i) => i !== index);
    setSavedItems(updated);
    localStorage.setItem('savedTafsir', JSON.stringify(updated));
  };

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
        <div className="bg-secondary p-3 rounded mt-3" style={{ wordBreak: 'break-all' }}>
          {errorMsg}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Navbar sticky="top" className="bg-warning px-3">
        <Container fluid>
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
                    <Button 
                      variant="outline-info" 
                      size="sm" 
                      className="ms-2 py-0 px-2"
                      onClick={(e) => {
                        e.stopPropagation();
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

          <Form className="d-flex w-50 me-2">
            <FormControl
              type="search"
              placeholder="কুরআন থেকে সার্চ করুন..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </Form>

          <Button variant="dark" onClick={() => setShowSavedModal(true)}>
            🔖 সেভ করা ({savedItems.length})
          </Button>
        </Container>
      </Navbar>

      <Container fluid className="mt-3">
        <Row>
          <Col>
            {quransData.length === 0 ? (
              <div className="text-center mt-5 bg-dark text-white py-4">
                <h5>কোনো ফলাফল পাওয়া যায়নি!</h5>
              </div>
            ) : (
              quransData.map((item, index) => (
                <Card key={index} className="mb-3 shadow-sm" bg="light" text="dark" border="secondary">
                  <Card.Header className="d-flex justify-content-between bg-dark text-white align-items-center">
                    <span>{item.book}</span>
                    <div>
                      {/* ✅ আয়াতের জন্য আলাদা কপি ও সেভ বাটন */}
                      <Button variant="outline-light" size="sm" className="me-1" onClick={() => handleCopy(item.verses)}>কপি</Button>
                      <Button variant="outline-warning" size="sm" onClick={() => handleSave(item, 'verses', item.verses)}>সেভ</Button>
                    </div>
                  </Card.Header>
                  <Card.Body style={{ backgroundColor: "#f8f9fa" }}>
                    <div className="bg-secondary text-light p-2 mb-3 rounded" style={{ whiteSpace: "pre-wrap", fontSize: "18px" }}>
                      {highlightText(item.verses, searchQuery)}
                      <span className="badge bg-warning text-dark ms-2 mt-2 d-inline-block">
                        [{item.name} - {item.number}:{item.versesNumber}]
                      </span>
                    </div>

                    <Tab.Container id={`tabs-${index}`} defaultActiveKey="first">
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
                              {/* ✅ সারসংক্ষেপের জন্য আলাদা কপি ও সেভ বাটন */}
                              <div className="d-flex justify-content-end mb-2">
                                <Button variant="outline-secondary" size="sm" className="me-1" onClick={() => handleCopy(item.summary)}>কপি</Button>
                                <Button variant="outline-secondary" size="sm" onClick={() => handleSave(item, 'summary', item.summary)}>সেভ</Button>
                              </div>
                              <div style={{ whiteSpace: "pre-wrap", fontSize: "15px", color: "#000000" }}>
                                {highlightText(item.summary, searchQuery)}
                              </div>
                            </Tab.Pane>
                            
                            <Tab.Pane eventKey="second">
                              {/* ✅ আনুষঙ্গিক বিষয়ের জন্য আলাদা কপি ও সেভ বাটন */}
                              <div className="d-flex justify-content-end mb-2">
                                <Button variant="outline-secondary" size="sm" className="me-1" onClick={() => handleCopy(item.ancillary_issue || "কোন তথ্য নেই")}>কপি</Button>
                                <Button variant="outline-secondary" size="sm" onClick={() => handleSave(item, 'ancillary', item.ancillary_issue || "কোন তথ্য নেই")}>সেভ</Button>
                              </div>
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

      {/* লেখক পরিচিতির মডাল */}
      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg" centered scrollable>
        <Modal.Header closeButton className="bg-dark text-white">
          <Modal.Title>{modalContent.title} - লেখক পরিচিতি</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ whiteSpace: "pre-wrap", fontSize: "15px", backgroundColor: "#f8f9fa", color: "#000" }}>
          {modalContent.body}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>বন্ধ করুন</Button>
        </Modal.Footer>
      </Modal>

      {/* সেভ করা তালিকা মডাল */}
      <Modal show={showSavedModal} onHide={() => setShowSavedModal(false)} size="lg" scrollable>
        <Modal.Header closeButton className="bg-dark text-white">
          <Modal.Title>🔖 সেভ করা তাফসীরসমূহ</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ backgroundColor: "#f8f9fa" }}>
          {savedItems.length === 0 ? (
            <p className="text-center">আপনি এখনো কোনো তাফসীর সেভ করেননি!</p>
          ) : (
            savedItems.map((s, idx) => (
              <Card key={idx} className="mb-3">
                <Card.Header className="d-flex justify-content-between bg-secondary text-white align-items-center">
                  <span>{s.book} - {s.name} ({s.type === 'verses' ? 'আয়াত' : s.type === 'summary' ? 'সারসংক্ষেপ' : 'আনুষঙ্গিক'})</span>
                  <Button variant="danger" size="sm" onClick={() => handleDeleteSaved(idx)}>ডিলিট</Button>
                </Card.Header>
                <Card.Body>
                  <div style={{ whiteSpace: "pre-wrap", fontSize: "14px" }}>{s.content}</div>
                </Card.Body>
              </Card>
            ))
          )}
        </Modal.Body>
      </Modal>
    </div>
  );
}
