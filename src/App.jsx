import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, ListGroup, Tab, Navbar, Dropdown, Form, FormControl } from 'react-bootstrap';
import Database from '@tauri-apps/plugin-sql';
import { exists, BaseDirectory, remove } from '@tauri-apps/plugin-fs';
import { download } from '@tauri-apps/plugin-upload';
import { appDataDir, join } from '@tauri-apps/api/path';
import { fetch } from '@tauri-apps/plugin-http';
import { invoke } from '@tauri-apps/api/core'; // ✅ Rust কমান্ড কল করার জন্য

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
  const [debugLog, setDebugLog] = useState("লগ অপেক্ষা করছে...");

  useEffect(() => {
    async function initDb() {
      try {
        const dbExists = await exists('tafsir.db', { baseDir: BaseDirectory.AppData });
        
        if (!dbExists) {
          setLoadingMsg("সার্ভার থেকে সাইজ চেক করা হচ্ছে...");
          
          const appData = await appDataDir();
          const dbPath = await join(appData, 'tafsir.db');
          
          // ✅ ১. সার্ভার থেকে মোট সাইজ বের করা (HEAD রিকোয়েস্ট)
          let totalFileSize = 0;
          try {
            const headResponse = await fetch(DB_URL, { method: 'HEAD' });
            const contentLength = headResponse.headers.get('content-length');
            if (contentLength) {
              totalFileSize = parseInt(contentLength, 10);
            }
          } catch (err) {
            setDebugLog("Size fetch failed, using fallback...");
          }

          if (totalFileSize === 0) {
             totalFileSize = 133 * 1024 * 1024; // fallback
          }

          setLoadingMsg("প্রথমবার ডেটাবেস ডাউনলোড হচ্ছে...");

          // ✅ ২. Rust থেকে ফাইল সাইজ চেক করার ইন্টারভাল
          const intervalId = setInterval(async () => {
            try {
              const downloaded = await invoke('get_file_size', { path: dbPath });
              
              if (downloaded > 0) {
                const percent = Math.min(Math.round((downloaded / totalFileSize) * 100), 100);
                const mbDownloaded = (downloaded / (1024 * 1024)).toFixed(2);
                const mbTotal = (totalFileSize / (1024 * 1024)).toFixed(2);
                
                setLoadingMsg(`ডাউনলোড হচ্ছে: ${percent}% (${mbDownloaded} MB / ${mbTotal} MB)`);
                setDebugLog(`Downloaded: ${mbDownloaded} MB / ${mbTotal} MB`);
              } else {
                setDebugLog(`Waiting for file to start...`);
              }
            } catch (e) {
              setDebugLog(`Error: ${e}`);
            }
          }, 1000);

          try {
            // ✅ ৩. ডাউনলোড শুরু
            await download(DB_URL, dbPath);
          } finally {
            clearInterval(intervalId); // ডাউনলোড শেষ হলে ইন্টারভাল বন্ধ
          }
          
          setLoadingMsg("ডাউনলোড সম্পন্ন! লোড হচ্ছে...");
        } else {
          setLoadingMsg("ডেটাবেস লোড হচ্ছে...");
        }

        // ৪. SQLite ডেটাবেস ওপেন করা
        const database = await Database.load('sqlite:tafsir.db');
        setDb(database);
        
        const books = await database.select('SELECT * FROM books');
        setBooksData(books);

        const initialQurans = await database.select('SELECT * FROM qurans LIMIT 50');
        setQuransData(initialQurans);

      } catch (error) {
        console.error("DB Error:", error);
        setErrorMsg(error.toString() || "Unknown Database Error");
        setDebugLog("Error: " + error.toString());
        
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

  if (loading) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center vh-100 bg-dark text-white text-center p-4">
        <h4>{loadingMsg}</h4>
        <div 
          className="mt-4 p-3 bg-secondary rounded text-warning" 
          style={{ fontSize: '12px', wordBreak: 'break-all', fontFamily: 'monospace', width: '100%' }}
        >
          <strong>Debug Info:</strong><br />
          {debugLog}
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="p-4 bg-dark text-white vh-100">
        <h3 className="text-danger">ডেটাবেস এরর!</h3>
        <p className="mt-3">দয়া করে নিচের এররটি ডেভেলপারকে জানান:</p>
        <div className="bg-secondary p-3 rounded mt-3" style={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>
          {errorMsg}
        </div>
        <div className="bg-secondary p-3 rounded mt-3 text-warning" style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '12px' }}>
          {debugLog}
        </div>
      </div>
    );
  }

  return (
    <div>
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
    </div>
  );
}
