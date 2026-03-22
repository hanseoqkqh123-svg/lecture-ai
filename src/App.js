import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { io } from "socket.io-client";

const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";

const socket = io(API_BASE_URL, {
  transports: ["websocket", "polling"],
  autoConnect: true,
});

function safeJSONParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeLecture(item) {
  return {
    ...item,
    summary_data:
      typeof item.summary_data === "string"
        ? safeJSONParse(item.summary_data, {
            summary: "",
            keywords: [],
            quiz: [],
          })
        : item.summary_data || {
            summary: "",
            keywords: [],
            quiz: [],
          },
  };
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return !!localStorage.getItem("user");
  });
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem("user");
    return savedUser ? safeJSONParse(savedUser, null) : null;
  });
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [authMessage, setAuthMessage] = useState("");
  const [serverStatus, setServerStatus] = useState("확인 중...");
  const [activeTab, setActiveTab] = useState("lecture");

  const [lectureTitle, setLectureTitle] = useState("");
  const [lectureText, setLectureText] = useState("");
  const [summary, setSummary] = useState("");
  const [keywords, setKeywords] = useState([]);
  const [quiz, setQuiz] = useState([]);
  const [savedLectures, setSavedLectures] = useState([]);
  const [selectedLecture, setSelectedLecture] = useState(null);
  const [lectureMessage, setLectureMessage] = useState("");

  const [messages, setMessages] = useState({});
  const [chatInput, setChatInput] = useState("");
  const [currentRoomId, setCurrentRoomId] = useState("default-room");

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const userId = user?.user_id;

  useEffect(() => {
    fetch(`${API_BASE_URL}/`)
      .then((res) => {
        if (!res.ok) throw new Error("서버 응답 실패");
        return res.text();
      })
      .then(() => setServerStatus("연결됨"))
      .catch(() => setServerStatus("서버 연결 실패!"));
  }, []);

  useEffect(() => {
    socket.on("connect", () => {
      console.log("소켓 연결 성공:", socket.id);
    });

    socket.on("connect_error", (err) => {
      console.log("소켓 연결 오류:", err.message);
    });

    socket.on("receive_message", (data) => {
      console.log("서버에서 받은 메시지:", data);
      setMessages((prev) => ({
        ...prev,
        [data.roomId]: [...(prev[data.roomId] || []), data.message],
      }));
    });

    return () => {
      socket.off("connect");
      socket.off("connect_error");
      socket.off("receive_message");
    };
  }, []);

  useEffect(() => {
    if (isLoggedIn && userId) {
      fetchSavedLectures(userId);
    }
  }, [isLoggedIn, userId]);

  async function fetchSavedLectures(uid) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/lectures/${uid}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "강의 목록 불러오기 실패");
      }

      const normalized = Array.isArray(data)
        ? data.map(normalizeLecture)
        : [];
      setSavedLectures(normalized);
    } catch (error) {
      console.error("강의 목록 불러오기 오류:", error);
    }
  }

  function handleAuthInputChange(e) {
    const { name, value } = e.target;
    setAuthForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleRegister(e) {
    e.preventDefault();
    setAuthMessage("");

    try {
      const res = await fetch(`${API_BASE_URL}/api/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: authForm.name,
          email: authForm.email,
          password: authForm.password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "회원가입 실패");
      }

      setAuthMessage("회원가입 성공! 로그인 해주세요.");
      setAuthMode("login");
      setAuthForm({
        name: "",
        email: authForm.email,
        password: "",
      });
    } catch (error) {
      setAuthMessage(error.message || "회원가입 중 오류가 발생했습니다.");
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setAuthMessage("");

    try {
      const res = await fetch(`${API_BASE_URL}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: authForm.email,
          password: authForm.password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "로그인 실패");
      }

      const loginUser = data.user || data;

      localStorage.setItem("user", JSON.stringify(loginUser));
      setUser(loginUser);
      setIsLoggedIn(true);
      setAuthMessage("");
    } catch (error) {
      setAuthMessage(error.message || "로그인 중 오류가 발생했습니다.");
    }
  }

  function handleLogout() {
    localStorage.removeItem("user");
    setIsLoggedIn(false);
    setUser(null);
    setActiveTab("lecture");
    setLectureTitle("");
    setLectureText("");
    setSummary("");
    setKeywords([]);
    setQuiz([]);
    setSelectedLecture(null);
  }

  function generateKeywords(text) {
    const words = text
      .replace(/[^\w가-힣\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 1);

    const stopWords = new Set([
      "그리고",
      "하지만",
      "그러나",
      "입니다",
      "있습니다",
      "합니다",
      "있는",
      "에서",
      "으로",
      "대한",
      "이번",
      "강의",
      "내용",
      "수업",
      "학생",
      "교수",
      "the",
      "and",
      "that",
      "with",
      "this",
      "from",
    ]);

    const counts = {};
    for (const word of words) {
      if (!stopWords.has(word)) {
        counts[word] = (counts[word] || 0) + 1;
      }
    }

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  function generateQuiz(text, keywordsList) {
    const shortSummary = text.slice(0, 120);
    return [
      {
        question: "이 강의의 핵심 주제는 무엇인가요?",
        answer: keywordsList[0] || "핵심 주제",
      },
      {
        question: "강의에서 중요하게 다뤄진 개념 하나를 적어보세요.",
        answer: keywordsList[1] || keywordsList[0] || "핵심 개념",
      },
      {
        question: "강의 내용을 한 문장으로 요약하면?",
        answer: shortSummary + (text.length > 120 ? "..." : ""),
      },
    ];
  }

  function handleGenerateSummary() {
    if (!lectureTitle.trim() || !lectureText.trim()) {
      setLectureMessage("강의 제목과 내용을 입력해주세요.");
      return;
    }

    const sentences = lectureText
      .split(/(?<=[.!?다요])\s+|\n+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const generatedSummary =
      sentences.slice(0, 3).join(" ") ||
      lectureText.slice(0, 200) + (lectureText.length > 200 ? "..." : "");

    const generatedKeywords = generateKeywords(lectureText);
    const generatedQuiz = generateQuiz(lectureText, generatedKeywords);

    setSummary(generatedSummary);
    setKeywords(generatedKeywords);
    setQuiz(generatedQuiz);
    setSelectedLecture(null);
    setLectureMessage("요약 생성 완료");
  }

  async function handleSaveLecture() {
    if (!lectureTitle.trim() || !lectureText.trim()) {
      setLectureMessage("저장할 강의 제목과 내용을 입력해주세요.");
      return;
    }

    const summaryData = {
      summary,
      keywords,
      quiz,
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/lectures`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId,
          title: lectureTitle,
          raw_text: lectureText,
          summary_data: summaryData,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "강의 저장 실패");
      }

      setLectureMessage("강의가 저장되었습니다.");
      fetchSavedLectures(userId);
    } catch (error) {
      setLectureMessage(error.message || "강의 저장 중 오류가 발생했습니다.");
    }
  }

  function handleSelectLecture(lecture) {
    const parsedLecture = normalizeLecture(lecture);
    setSelectedLecture(parsedLecture);
    setLectureTitle(parsedLecture.title || "");
    setLectureText(parsedLecture.raw_text || "");
    setSummary(parsedLecture.summary_data?.summary || "");
    setKeywords(parsedLecture.summary_data?.keywords || []);
    setQuiz(parsedLecture.summary_data?.quiz || []);
    setLectureMessage("");
  }

  function handleNewLecture() {
    setSelectedLecture(null);
    setLectureTitle("");
    setLectureText("");
    setSummary("");
    setKeywords([]);
    setQuiz([]);
    setLectureMessage("");
  }

  function handleSendMessage() {
    if (!chatInput.trim()) return;

    const newMessage = {
      sender: user?.name || "사용자",
      text: chatInput,
      time: new Date().toLocaleTimeString("ko-KR"),
    };

    socket.emit("send_message", {
      roomId: currentRoomId,
      message: newMessage,
    });

    setMessages((prev) => ({
      ...prev,
      [currentRoomId]: [...(prev[currentRoomId] || []), newMessage],
    }));

    setChatInput("");
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const transcriptPlaceholder =
          "녹음된 음성을 텍스트로 변환한 내용이 여기에 들어갑니다.";
        setLectureText((prev) =>
          prev ? `${prev}\n${transcriptPlaceholder}` : transcriptPlaceholder
        );
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("녹음 시작 오류:", error);
      alert("마이크 권한을 확인해주세요.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }

  const displayKeywords = useMemo(() => keywords || [], [keywords]);
  const displayQuiz = useMemo(() => quiz || [], [quiz]);

  if (!isLoggedIn) {
    return (
      <div className="app">
        <div className="container authWrap">
          <div className="card authCard">
            <h1>AI 기반 실시간 강의 요약 및 퀴즈 생성 웹</h1>
            <p className="subText">서버 상태: {serverStatus}</p>

            <div className="tabRow">
              <button
                className={authMode === "login" ? "primaryBtn" : "secondaryBtn"}
                onClick={() => setAuthMode("login")}
              >
                로그인
              </button>
              <button
                className={authMode === "register" ? "primaryBtn" : "secondaryBtn"}
                onClick={() => setAuthMode("register")}
              >
                회원가입
              </button>
            </div>

            <form
              className="formGrid"
              onSubmit={authMode === "login" ? handleLogin : handleRegister}
            >
              {authMode === "register" && (
                <input
                  className="input"
                  type="text"
                  name="name"
                  placeholder="이름"
                  value={authForm.name}
                  onChange={handleAuthInputChange}
                  required
                />
              )}

              <input
                className="input"
                type="email"
                name="email"
                placeholder="이메일"
                value={authForm.email}
                onChange={handleAuthInputChange}
                required
              />
              <input
                className="input"
                type="password"
                name="password"
                placeholder="비밀번호"
                value={authForm.password}
                onChange={handleAuthInputChange}
                required
              />

              <button className="primaryBtn" type="submit">
                {authMode === "login" ? "로그인" : "회원가입"}
              </button>
            </form>

            {authMessage && <div className="statusMessage">{authMessage}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="container">
        <div className="card">
          <div className="headerRow">
            <div>
              <h1>AI 기반 실시간 강의 요약 및 퀴즈 생성 웹</h1>
              <p className="subText">
                안녕하세요, {user?.name || user?.email || "사용자"}님
              </p>
            </div>

            <div className="headerActions">
              <div className="badge">서버 상태: {serverStatus}</div>
              <button
                className={activeTab === "lecture" ? "primaryBtn" : "secondaryBtn"}
                onClick={() => setActiveTab("lecture")}
              >
                강의
              </button>
              <button
                className={activeTab === "chat" ? "primaryBtn" : "secondaryBtn"}
                onClick={() => setActiveTab("chat")}
              >
                채팅
              </button>
              <button className="secondaryBtn" onClick={handleLogout}>
                로그아웃
              </button>
            </div>
          </div>
        </div>

        {activeTab === "lecture" && (
          <div className="gridLayout">
            <div className="leftPanel">
              <div className="card">
                <div className="sectionHeader">
                  <h2>강의 입력</h2>
                  <button className="secondaryBtn" onClick={handleNewLecture}>
                    새 강의
                  </button>
                </div>

                <div className="formGrid">
                  <input
                    className="input"
                    type="text"
                    placeholder="강의 제목"
                    value={lectureTitle}
                    onChange={(e) => setLectureTitle(e.target.value)}
                  />

                  <textarea
                    className="textarea"
                    placeholder="강의 내용을 입력하세요"
                    value={lectureText}
                    onChange={(e) => setLectureText(e.target.value)}
                    rows={10}
                  />

                  <div className="buttonRow">
                    {!isRecording ? (
                      <button className="secondaryBtn" onClick={startRecording}>
                        녹음 시작
                      </button>
                    ) : (
                      <button className="secondaryBtn" onClick={stopRecording}>
                        녹음 종료
                      </button>
                    )}

                    <button className="primaryBtn" onClick={handleGenerateSummary}>
                      요약 생성
                    </button>
                    <button className="secondaryBtn" onClick={handleSaveLecture}>
                      저장
                    </button>
                  </div>
                </div>

                {lectureMessage && (
                  <div className="statusMessage">{lectureMessage}</div>
                )}
              </div>

              <div className="card">
                <div className="sectionHeader">
                  <h2>저장된 강의</h2>
                </div>

                <div className="historyList">
                  {savedLectures.length === 0 ? (
                    <div className="emptyBox">저장된 강의가 없습니다.</div>
                  ) : (
                    savedLectures.map((lecture) => (
                      <button
                        key={lecture.id}
                        className={`historyItem ${
                          selectedLecture?.id === lecture.id
                            ? "historyItemActive"
                            : ""
                        }`}
                        onClick={() => handleSelectLecture(lecture)}
                      >
                        <div className="historyTitle">{lecture.title}</div>
                        <div className="historyMeta">
                          {lecture.created_at
                            ? new Date(lecture.created_at).toLocaleString("ko-KR")
                            : "시간 정보 없음"}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="rightPanel">
              <div className="card">
                <h2>강의 요약</h2>
                <div className="summaryBox">
                  {summary || "생성된 요약이 없습니다."}
                </div>
              </div>

              <div className="card">
                <h2>핵심 키워드</h2>
                <div className="keywordWrap">
                  {displayKeywords.length > 0 ? (
                    displayKeywords.map((keyword, idx) => (
                      <span className="keywordChip" key={`${keyword}-${idx}`}>
                        #{keyword}
                      </span>
                    ))
                  ) : (
                    <div className="emptyBox">키워드가 없습니다.</div>
                  )}
                </div>
              </div>

              <div className="card">
                <h2>복습 퀴즈</h2>
                <div className="quizList">
                  {displayQuiz.length > 0 ? (
                    displayQuiz.map((item, idx) => (
                      <div className="quizItem" key={idx}>
                        <div className="quizQuestion">
                          Q{idx + 1}. {item.question}
                        </div>
                        <div className="quizAnswer">예상 답변: {item.answer}</div>
                      </div>
                    ))
                  ) : (
                    <div className="emptyBox">퀴즈가 없습니다.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "chat" && (
          <div className="card">
            <div className="sectionHeader">
              <h2>팀 채팅</h2>
              <div className="badge">Room: {currentRoomId}</div>
            </div>

            <div className="chatBox">
              {(messages[currentRoomId] || []).length === 0 ? (
                <div className="emptyBox">아직 메시지가 없습니다.</div>
              ) : (
                (messages[currentRoomId] || []).map((msg, idx) => (
                  <div className="chatMessage" key={idx}>
                    <strong>{msg.sender}</strong>: {msg.text}
                    <div className="chatTime">{msg.time}</div>
                  </div>
                ))
              )}
            </div>

            <div className="buttonRow">
              <input
                className="input"
                type="text"
                placeholder="메시지를 입력하세요"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSendMessage();
                }}
              />
              <button className="primaryBtn" onClick={handleSendMessage}>
                전송
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;