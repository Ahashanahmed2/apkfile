import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, ListGroup, Tab, Navbar, Dropdown, Form, FormControl, Modal, Button, Offcanvas } from 'react-bootstrap';
import Database from '@tauri-apps/plugin-sql';
import { exists, BaseDirectory, remove } from '@tauri-apps/plugin-fs';
import { download } from '@tauri-apps/plugin-upload';
import { appDataDir, join } from '@tauri-apps/api/path';
import { fetch } from '@tauri-apps/plugin-http';
import { invoke } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

const DB_URL = "https://huggingface.co/datasets/ahashanahmed/tafsir/resolve/main/tafsir.db";
const VERSION_URL = "https://huggingface.co/datasets/ahashanahmed/tafsir/resolve/main/version.json";
const APP_DB_VERSION = "1.0";

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
  const [db, setDb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("অ্যাপ চালু হচ্ছে...");
  const [errorMsg, setErrorMsg] = useState(null);

  const [booksData, setBooksData] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [selectedSurah, setSelectedSurah] = useState("সব সূরা");
  const [searchQuery, setSearchQuery] = useState("");
  const [quransData, setQuransData] = useState([]);
  
  // ✅ নতুন স্টেট: সব সূরা লোড করার জন্য
  const [uniqueSurahs, setUniqueSurahs] = useState([]);

  const [darkMode, setDarkMode] = useState(localStorage.getItem('theme') === 'dark');
  const [fontSize, setFontSize] = useState(Number(localStorage.getItem('fontSize')) || 18);
  const [showSettings, setShowSettings] = useState(false);

  const [savedItems, setSavedItems] = useState([]);
  const [showSavedModal, setShowSavedModal] = useState(false);
  const [savedSearchQuery, setSavedSearchQuery] = useState("");

  const [showIntroModal, setShowIntroModal] = useState(false);
  const [introContent, setIntroContent] = useState({ title: "", body: "" });

  const [showSplash, setShowSplash] = useState(true);
  const [updateAvailable, setUpdateAvailable] = useState(null);
  const [updateNotes, setUpdateNotes] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('savedTafsir');
    if (saved) setSavedItems(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('fontSize', fontSize.toString());
    document.body.style.backgroundColor = darkMode ? '#1a1a1a' : '#f8f9fa';
  }, [darkMode, fontSize]);

  useEffect(() => {
    async function initDb() {
      try {
        let newVersionData = null;
        try {
          const versionRes = await fetch(VERSION_URL);
          if (versionRes.ok) newVersionData = await versionRes.json();
        } catch (e) {}

        const dbExists = await exists('tafsir.db', { baseDir: BaseDirectory.AppData });
        const storedDbVersion = localStorage.getItem('dbVersion');

        if (dbExists && newVersionData && newVersionData.version !== storedDbVersion) {
          setUpdateNotes(newVersionData.update_notes || "নতুন আপডেট পাওয়া গেছে।");
          setUpdateAvailable(newVersionData.version);
          setLoading(false);
          return; 
        }

        if (!dbExists) {
          setLoadingMsg("প্রথমবার ডেটাবেস ডাউনলোড হচ্ছে...");
          const appData = await appDataDir();
          const dbPath = await join(appData, 'tafsir.db');
          
          let totalFileSize = 133 * 1024 * 1024;
          try {
            const headResponse = await fetch(DB_URL, { method: 'HEAD' });
            const cl = headResponse.headers.get('content-length');
            if (cl) totalFileSize = parseInt(cl, 10);
          } catch (err) {}

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

          try { await download(DB_URL, dbPath); } finally { clearInterval(intervalId); }
          
          localStorage.setItem('dbVersion', newVersionData ? newVersionData.version : APP_DB_VERSION);
        } else {
          setLoadingMsg("ডেটাবেস লোড হচ্ছে...");
        }

        const database = await Database.load('sqlite:tafsir.db');
        setDb(database);
        const books = await database.select('SELECT * FROM books');
        setBooksData(books);
        
        // ✅ সব ইউনিক সূরা আলাদাভাবে লোড করা
        const surahs = await database.select('SELECT DISTINCT name FROM qurans WHERE name IS NOT NULL ORDER BY name ASC');
        setUniqueSurahs(surahs.map(s => s.name));

        const initialQurans = await database.select('SELECT * FROM qurans LIMIT 50');
        setQuransData(initialQurans);
      } catch (error) {
        setErrorMsg(error.toString());
      } finally {
        setLoading(false);
      }
    }
    initDb();
  }, []);

  useEffect(() => {
    if (!db) return;
    async function fetchData() {
      let query = 'SELECT * FROM qurans WHERE 1=1';
      const params = [];
      if (selectedBook) { query += ' AND book = ?'; params.push(selectedBook); }
      if (selectedSurah !== "সব সূরা") { query += ' AND name = ?'; params.push(selectedSurah); }
      if (searchQuery.trim() !== '') {
        query += ' AND (verses LIKE ? OR summary LIKE ? OR ancillary_issue LIKE ?)';
        const p = `%${searchQuery}%`; params.push(p, p, p);
      }
      query += ' LIMIT 100';
      try {
        const results = await db.select(query, params);
        setQuransData(results);
      } catch (err) { console.error(err); }
    }
    fetchData();
  }, [selectedBook, selectedSurah, searchQuery, db]);

  const handleCopy = async (text) => {
    try { await writeText(text); alert("কপি হয়েছে!"); } catch (e) { alert("কপি ব্যর্থ!"); }
  };

  const handleSave = (item, type, content) => {
    if (!content) return alert("কোনো তথ্য নেই!");
    const newItem = { id: item._id + type, book: item.book, name: item.name, type, content };
    if (savedItems.find(i => i.id === newItem.id)) return alert("ইতিমধ্যে সেভ করা আছে!");
    const updated = [...savedItems, newItem];
    setSavedItems(updated);
    localStorage.setItem('savedTafsir', JSON.stringify(updated));
    alert("সেভ হয়েছে!");
  };

  const handleDeleteSaved = (id) => {
    const updated = savedItems.filter(i => i.id !== id);
    setSavedItems(updated);
    localStorage.setItem('savedTafsir', JSON.stringify(updated));
  };

  const handleUpdateDb = async () => {
    setLoading(true);
    setUpdateAvailable(null);
    setLoadingMsg("নতুন ডেটাবেস ডাউনলোড হচ্ছে...");
    try {
      const appData = await appDataDir();
      const dbPath = await join(appData, 'tafsir.db');
      await remove('tafsir.db', { baseDir: BaseDirectory.AppData });

      let totalFileSize = 133 * 1024 * 1024;
      try {
        const headResponse = await fetch(DB_URL, { method: 'HEAD' });
        const cl = headResponse.headers.get('content-length');
        if (cl) totalFileSize = parseInt(cl, 10);
      } catch (err) {}

      const intervalId = setInterval(async () => {
        try {
          const downloaded = await invoke('get_file_size', { path: dbPath });
          if (downloaded > 0) {
            const percent = Math.min(Math.round((downloaded / totalFileSize) * 100), 100);
            const mbDownloaded = (downloaded / (1024 * 1024)).toFixed(2);
            const mbTotal = (totalFileSize / (1024 * 1024)).toFixed(2);
            setLoadingMsg(`নতুন ডেটাবেস ডাউনলোড হচ্ছে: ${percent}% (${mbDownloaded} MB / ${mbTotal} MB)`);
          }
        } catch (e) {}
      }, 1000);

      try { await download(DB_URL, dbPath); } finally { clearInterval(intervalId); }
      
      localStorage.setItem('dbVersion', updateAvailable);
      alert("আপডেট সফল হয়েছে! অ্যাপ রিস্টার্ট হবে।");
      window.location.reload();
    } catch (e) {
      alert("আপডেট ব্যর্থ: " + e);
      setLoading(false);
    }
  };

  if (showSplash) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center vh-100" style={{ background: '#1a1a1a', color: 'gold' }}>
        <h1 className="display-4 mb-3">☪️</h1>
        <h2>তাফসীর অ্যাপ</h2>
        <p>জ্ঞান অর্জনের সহজ পথ</p>
      </div>
    );
  }

  if (updateAvailable && !loading) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center vh-100 p-4 text-center" style={{ backgroundColor: '#1a1a1a', color: 'white' }}>
        <h2 className="text-warning mb-3">🎉 নতুন আপডেট পাওয়া গেছে!</h2>
        <div className="bg-secondary p-3 rounded mb-4" style={{ maxWidth: '400px', width: '100%' }}>
          <p>{updateNotes}</p>
        </div>
        <Button variant="success" size="lg" onClick={handleUpdateDb}>এখনই আপডেট করুন</Button>
        <Button variant="outline-light" className="mt-3" onClick={() => { setUpdateAvailable(null); setLoading(false); }}>পরে করব</Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center vh-100 bg-dark text-white text-center p-4">
        <h4>{loadingMsg}</h4>
      </div>
    );
  }

  if (errorMsg) {
    return <div className="p-4 bg-dark text-white vh-100"><h3 className="text-danger">এরর!</h3><p>{errorMsg}</p></div>;
  }

  const themeClass = darkMode ? "bg-dark text-light" : "bg-light text-dark";
  const cardBg = darkMode ? "bg-secondary text-white" : "bg-light text-dark";

  return (
    <div className={themeClass} style={{ minHeight: '100vh', touchAction: 'pan-x pan-y pinch-zoom' }}>
      
      {/* ✅ মডালের ক্রস চিহ্ন ঠিক করার জন্য স্টাইল */}
      <style>{`
        .btn-close {
          filter: invert(1) grayscale(100%) brightness(200%) !important;
        }
      `}</style>

      <Navbar sticky="top" className="bg-warning px-2 shadow-sm">
        <Container fluid>
          <Dropdown>
            <Dropdown.Toggle variant="success" id="book-dropdown" size="sm">
              {selectedBook ? selectedBook : "সব বই"}
            </Dropdown.Toggle>
            <Dropdown.Menu style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <Dropdown.Item onClick={() => setSelectedBook(null)}>সব বই</Dropdown.Item>
              {booksData.map((b, i) => (
                <div key={i} className="d-flex justify-content-between align-items-center px-2 py-1">
                  <span onClick={() => setSelectedBook(b.book)} style={{ cursor: 'pointer', flex: 1 }}>{b.book}</span>
                  <Button variant="outline-info" size="sm" className="ms-2 py-0 px-2" 
                    onClick={(e) => { e.stopPropagation(); setIntroContent({ title: b.book, body: b.Author_Introduction }); setShowIntroModal(true); }}>
                    ℹ️
                  </Button>
                </div>
              ))}
            </Dropdown.Menu>
          </Dropdown>
          
          <Form.Select size="sm" style={{ width: '130px' }} className="ms-2" value={selectedSurah} onChange={(e) => setSelectedSurah(e.target.value)}>
            <option value="সব সূরা">সব সূরা</option>
            {uniqueSurahs.map((s, i) => <option key={i} value={s}>{s}</option>)}
          </Form.Select>
          
          <Form className="d-flex mx-2 flex-grow-1">
            <FormControl type="search" size="sm" placeholder="সার্চ করুন..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </Form>
          <Button variant="dark" size="sm" className="me-1" onClick={() => setShowSavedModal(true)}>
            🔖 {savedItems.length}
          </Button>
          <Button variant="dark" size="sm" onClick={() => setShowSettings(true)}>⚙️</Button>
        </Container>
      </Navbar>

      {/* ✅ প্যাডিং কমিয়ে লেখা সেন্টারে আনা হয়েছে */}
      <Container fluid className="mt-2 pb-4 px-2">
        <Row>
          <Col>
            {quransData.length === 0 ? (
              <div className="text-center mt-5 py-4"><h5>কোনো ফলাফল পাওয়া যায়নি!</h5></div>
            ) : (
              quransData.map((item, index) => (
                <Card key={index} className={`mb-3 shadow-sm ${cardBg}`} border="secondary">
                  <Card.Header className="d-flex justify-content-between align-items-center bg-dark text-white">
                    <span>{item.book}</span>
                    <span>{item.name} ({item.number})</span>
                  </Card.Header>
                  <Card.Body>
                    <div className="p-2 mb-3 rounded" style={{ whiteSpace: "pre-wrap", fontSize: `${fontSize}px`, backgroundColor: darkMode ? '#333' : '#e9ecef' }}>
                      {highlightText(item.verses, searchQuery)}
                      <span className="badge bg-warning text-dark ms-2 mt-2 d-inline-block">
                        [{item.name} - {item.number}:{item.versesNumber}]
                      </span>
                    </div>
                    <div className="d-flex gap-2 mb-3">
                      <Button variant="outline-secondary" size="sm" onClick={() => handleCopy(item.verses)}>কপি</Button>
                      <Button variant="outline-warning" size="sm" onClick={() => handleSave(item, 'verses', item.verses)}>সেভ</Button>
                    </div>

                    <Tab.Container id={`tabs-${index}`} defaultActiveKey="first">
                      <Row>
                        <Col sm={4}>
                          <ListGroup>
                            <ListGroup.Item action eventKey="first" className={darkMode ? "bg-dark text-light border-secondary" : "text-dark"}>সারসংক্ষেপ</ListGroup.Item>
                            <ListGroup.Item action eventKey="second" className={darkMode ? "bg-dark text-light border-secondary" : "text-dark"}>আনুষঙ্গিক বিষয়</ListGroup.Item>
                          </ListGroup>
                        </Col>
                        <Col sm={8}>
                          <Tab.Content>
                            <Tab.Pane eventKey="first">
                              <div className="d-flex justify-content-end mb-2 gap-1">
                                <Button variant="outline-secondary" size="sm" onClick={() => handleCopy(item.summary)}>কপি</Button>
                                <Button variant="outline-secondary" size="sm" onClick={() => handleSave(item, 'summary', item.summary)}>সেভ</Button>
                              </div>
                              <div style={{ whiteSpace: "pre-wrap", fontSize: `${fontSize - 2}px` }}>
                                {highlightText(item.summary, searchQuery)}
                              </div>
                            </Tab.Pane>
                            
                            <Tab.Pane eventKey="second">
                              <div className="d-flex justify-content-end mb-2 gap-1">
                                <Button variant="outline-secondary" size="sm" onClick={() => handleCopy(item.ancillary_issue || "কোন তথ্য নেই")}>কপি</Button>
                                <Button variant="outline-secondary" size="sm" onClick={() => handleSave(item, 'ancillary', item.ancillary_issue || "কোন তথ্য নেই")}>সেভ</Button>
                              </div>
                              <div style={{ whiteSpace: "pre-wrap", fontSize: `${fontSize - 2}px` }}>
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

      <Offcanvas show={showSettings} onHide={() => setShowSettings(false)} placement="end" className={themeClass}>
        <Offcanvas.Header closeButton className="bg-dark text-white">
          <Offcanvas.Title>⚙️ সেটিংস</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>
          <h5>থিম (Theme)</h5>
          <Form.Check type="switch" id="dark-mode-switch" label="ডার্ক মোড" checked={darkMode} onChange={() => setDarkMode(!darkMode)} className="mb-4" />
          
          <h5>ফন্ট সাইজ</h5>
          <div className="d-flex align-items-center mb-4">
            <Button variant="secondary" onClick={() => setFontSize(Math.max(14, fontSize - 2))}>A-</Button>
            <span className="mx-3 fw-bold">{fontSize}px</span>
            <Button variant="secondary" onClick={() => setFontSize(Math.min(30, fontSize + 2))}>A+</Button>
          </div>
          
          <h5>ডেটাবেস</h5>
          <p className="small">নতুন ডেটাবেস পেলে অ্যাপ চালু হওয়ার সময় আপডেটের নোটিশ আসবে।</p>
        </Offcanvas.Body>
      </Offcanvas>

      <Modal show={showSavedModal} onHide={() => setShowSavedModal(false)} size="lg" scrollable className={themeClass}>
        <Modal.Header closeButton className="bg-dark text-white">
          <Modal.Title>🔖 সেভ করা তালিকা</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <FormControl type="search" placeholder="সেভ করা তালিকায় সার্চ করুন..." className="mb-3" value={savedSearchQuery} onChange={(e) => setSavedSearchQuery(e.target.value)} />
          {savedItems.length === 0 ? (
            <p className="text-center">কোনো তথ্য সেভ করা নেই!</p>
          ) : (
            savedItems
              .filter(s => s.content.includes(savedSearchQuery) || s.name.includes(savedSearchQuery) || s.book.includes(savedSearchQuery))
              .map((s, idx) => (
              <Card key={idx} className={`mb-3 ${cardBg}`}>
                <Card.Header className="d-flex justify-content-between bg-secondary text-white align-items-center">
                  <span>{s.book} - {s.name}</span>
                  <Button variant="danger" size="sm" onClick={() => handleDeleteSaved(s.id)}>ডিলিট</Button>
                </Card.Header>
                <Card.Body>
                  <div style={{ whiteSpace: "pre-wrap", fontSize: "14px" }}>{s.content}</div>
                </Card.Body>
              </Card>
            ))
          )}
        </Modal.Body>
      </Modal>

      <Modal show={showIntroModal} onHide={() => setShowIntroModal(false)} size="lg" centered scrollable className={themeClass}>
        <Modal.Header closeButton className="bg-dark text-white">
          <Modal.Title>{introContent.title}</Modal.Title>
        </Modal.Header>
        {/* ✅ মডালের টেক্সট কালো এবং ব্যাকগ্রাউন্ড সাদা করা হয়েছে */}
        <Modal.Body style={{ whiteSpace: "pre-wrap", fontSize: "15px", color: '#000000', backgroundColor: '#ffffff' }}>
          {introContent.body}
        </Modal.Body>
      </Modal>
    </div>
  );
}
