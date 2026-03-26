import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { io } from "socket.io-client";

const API_BASE_URL =
  process.env.REACT_APP_API_URL || "http://localhost:5000";

const socket = io(API_BASE_URL, {
  autoConnect: true,
  transports: ["websocket", "polling"],
});

function normalizeLecture(row) {
  let parsed = {};
  try {
    parsed =
      typeof row.summary_data === "string"
        ? JSON.parse(row.summary_data)
        : row.summary_data || {};
  } catch {
    parsed = {};
  }

  return {
    ...row,
    summary: parsed.summary || "",
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    quiz: Array.isArray(parsed.quiz) ? parsed.quiz : [],
  };
}

function checkCorrect(userAnswer, answer) {
  return (
    String(userAnswer || "").trim().toLowerCase() ===
    String(answer || "").trim().toLowerCase()
  );
}

function extractKeywordsFromLectures(lectures) {
  const counts = {};

  lectures.forEach((lecture) => {
    const baseKeywords = Array.isArray(lecture.keywords) ? lecture.keywords : [];
    const titleWords = String(lecture.title || "")
      .replace(/[^\w가-힣\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1);

    [...baseKeywords, ...titleWords].forEach((word) => {
      const key = String(word).trim();
      if (!key) return;
      counts[key] = (counts[key] || 0) + 1;
    });
  });

  return Object.entries(counts)
    .map(([word, total]) => ({ word, total }))
    .sort((a, b) => b.total - a.total);
}

function getExamImportanceData(lectures) {
  const counts = {};

  lectures.forEach((lecture) => {
    const seen = new Set();
    const words = Array.isArray(lecture.keywords) ? lecture.keywords : [];

    words.forEach((word) => {
      const key = String(word).trim();
      if (!key) return;

      if (!counts[key]) {
        counts[key] = { word: key, frequency: 0, lectureCount: 0 };
      }

      counts[key].frequency += 1;

      if (!seen.has(key)) {
        counts[key].lectureCount += 1;
        seen.add(key);
      }
    });
  });

  return Object.values(counts)
    .map((item) => ({
      ...item,
      score: Math.round(item.frequency * 10 + item.lectureCount * 20),
    }))
    .sort((a, b) => b.score - a.score);
}

function getTier(score) {
  if (score >= 80) return { label: "매우 중요", color: "#dc2626", bg: "#fef2f2" };
  if (score >= 55) return { label: "중요", color: "#f59e0b", bg: "#fffbeb" };
  if (score >= 30) return { label: "보통", color: "#2563eb", bg: "#eff6ff" };
  return { label: "낮음", color: "#6b7280", bg: "#f9fafb" };
}

function App() {
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [authMessage, setAuthMessage] = useState("");

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);

  const [activeTab, setActiveTab] = useState("home");

  const [lectureTitle, setLectureTitle] = useState("");
  const [lectureText, setLectureText] = useState("");
  const [summary, setSummary] = useState("");
  const [keywords, setKeywords] = useState([]);
  const [quiz, setQuiz] = useState([]);
  const [lectureMessage, setLectureMessage] = useState("");

  const [savedLectures, setSavedLectures] = useState([]);
  const [selectedLecture, setSelectedLecture] = useState(null);
  const [loadingLectures, setLoadingLectures] = useState(false);

  const [answers, setAnswers] = useState({});

  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);

  const [currentRoomId, setCurrentRoomId] = useState("team-room");
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState({
    "team-room": [],
  });

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) return;

    try {
      const parsed = JSON.parse(storedUser);
      setUser(parsed);
      setIsLoggedIn(true);
    } catch {
      localStorage.removeItem("user");
    }
  }, []);

  useEffect(() => {
    if (!user?.user_id) return;

    socket.emit("join_room", { user_id: user.user_id, roomId: currentRoomId });

    const handleReceiveMessage = (data) => {
      const roomKey = data?.roomId || "team-room";
      setMessages((prev) => ({
        ...prev,
        [roomKey]: [...(prev[roomKey] || []), data],
      }));
    };

    socket.on("receive_message", handleReceiveMessage);

    return () => {
      socket.off("receive_message", handleReceiveMessage);
    };
  }, [user, currentRoomId]);

  useEffect(() => {
    if (isLoggedIn && user?.user_id) {
      fetchLectures();
    }
  }, [isLoggedIn, user]);

  async function fetchLectures() {
    if (!user?.user_id) return;

    setLoadingLectures(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/lectures/${user.user_id}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "강의 목록 불러오기 실패");
      }

      setSavedLectures((data || []).map(normalizeLecture));
    } catch (error) {
      setLectureMessage(error.message || "강의 목록을 불러오지 못했습니다.");
    } finally {
      setLoadingLectures(false);
    }
  }

  function handleAuthInputChange(e) {
    const { name, value } = e.target;
    setAuthForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSignup(e) {
    e.preventDefault();
    setAuthMessage("");

    try {
      const res = await fetch(`${API_BASE_URL}/api/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(authForm),
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
      setActiveTab("home");
      setAuthMessage("");
    } catch (error) {
      setAuthMessage(error.message || "로그인 중 오류가 발생했습니다.");
    }
  }

  function handleLogout() {
    localStorage.removeItem("user");
    setIsLoggedIn(false);
    setUser(null);
    setActiveTab("home");
    setLectureTitle("");
    setLectureText("");
    setSummary("");
    setKeywords([]);
    setQuiz([]);
    setSelectedLecture(null);
    setAnswers({});
    setMessages({ "team-room": [] });
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
    setAnswers({});
    setLectureMessage("요약 생성 완료");
  }

  async function handleSaveLecture() {
    if (!lectureTitle.trim() || !lectureText.trim()) {
      setLectureMessage("저장할 강의 제목과 내용을 입력해주세요.");
      return;
    }

    if (!user?.user_id) {
      setLectureMessage("로그인 후 저장할 수 있습니다.");
      return;
    }

    try {
      const summaryData = {
        summary,
        keywords,
        quiz,
      };

      const res = await fetch(`${API_BASE_URL}/api/lectures`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: user.user_id,
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
      await fetchLectures();
    } catch (error) {
      setLectureMessage(error.message || "강의 저장 중 오류가 발생했습니다.");
    }
  }

  function handleSelectLecture(lecture) {
    setSelectedLecture(lecture);
    setLectureTitle(lecture.title || "");
    setLectureText(lecture.raw_text || "");
    setSummary(lecture.summary || "");
    setKeywords(Array.isArray(lecture.keywords) ? lecture.keywords : []);
    setQuiz(Array.isArray(lecture.quiz) ? lecture.quiz : []);
    setAnswers({});
    setLectureMessage("저장된 강의를 불러왔습니다.");
    setActiveTab("lecture");
  }

  function startRecording() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setLectureMessage("이 브라우저는 음성 인식을 지원하지 않습니다.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ko-KR";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsRecording(true);
      setLectureMessage("녹음 중...");
    };

    recognition.onresult = (event) => {
      let finalTranscript = "";

      for (let i = 0; i < event.results.length; i += 1) {
        finalTranscript += event.results[i][0].transcript + " ";
      }

      setLectureText(finalTranscript.trim());
    };

    recognition.onerror = () => {
      setLectureMessage("음성 인식 중 오류가 발생했습니다.");
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
      setLectureMessage("녹음이 종료되었습니다.");
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  function stopRecording() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
  }

  function handleAnswerChange(index, value) {
    setAnswers((prev) => ({
      ...prev,
      [index]: value,
    }));
  }

  const result = useMemo(() => {
    const total = quiz.length;
    const correct = quiz.filter((item, idx) =>
      checkCorrect(answers[idx], item.answer)
    ).length;

    return {
      total,
      correct,
      score: total > 0 ? Math.round((correct / total) * 100) : 0,
    };
  }, [quiz, answers]);

  function handleSendMessage() {
    if (!chatInput.trim() || !user) return;

    const newMessage = {
      roomId: currentRoomId,
      sender: user.name || user.email || "익명",
      text: chatInput,
      time: new Date().toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    socket.emit("send_message", newMessage);

    setMessages((prev) => ({
      ...prev,
      [currentRoomId]: [...(prev[currentRoomId] || []), newMessage],
    }));

    setChatInput("");
  }

  const displayKeywords = selectedLecture ? selectedLecture.keywords || [] : keywords;
  const displayQuiz = selectedLecture ? selectedLecture.quiz || [] : quiz;

  const analytics = useMemo(() => {
    const lectures = savedLectures || [];
    const totalLectures = lectures.length;
    const quizTotal = lectures.reduce(
      (sum, lecture) => sum + (Array.isArray(lecture.quiz) ? lecture.quiz.length : 0),
      0
    );

    const keywordStats = extractKeywordsFromLectures(lectures).slice(0, 10);

    const dailyMap = {};
    lectures.forEach((lecture) => {
      const key = lecture.created_at
        ? new Date(lecture.created_at).toLocaleDateString("ko-KR")
        : "날짜 없음";
      dailyMap[key] = (dailyMap[key] || 0) + 1;
    });

    const daily = Object.entries(dailyMap).map(([date, count]) => ({
      date,
      count,
    }));

    return {
      totalLectures,
      quizTotal,
      keywordStats,
      daily,
      participation: Math.min(totalLectures * 10, 100),
      achievement: result.score,
      focusScore: Math.round((Math.min(totalLectures * 10, 100) + result.score) / 2),
    };
  }, [savedLectures, result.score]);

  const examImportance = useMemo(
    () => getExamImportanceData(savedLectures),
    [savedLectures]
  );

  if (!isLoggedIn) {
    return (
      <div className="workspaceAuthPage">
        <div className="workspaceAuthVisual">
          <div className="workspaceAuthImageBox">
            <div className="workspaceAuthEmoji">🎓</div>
            <h1 className="workspaceAuthTitle">Workspace</h1>
            <p className="workspaceAuthDesc">
              AI 기반 실시간 강의 요약 및 통합 워크스페이스
            </p>

            <div className="workspaceAuthFeatureList">
              <div className="workspaceAuthFeature">강의 요약 자동 생성</div>
              <div className="workspaceAuthFeature">핵심 키워드 추출</div>
              <div className="workspaceAuthFeature">복습 퀴즈 자동 생성</div>
              <div className="workspaceAuthFeature">팀 채팅 / 학습 분석</div>
            </div>
          </div>
        </div>

        <div className="workspaceAuthPanel">
          <div className="workspaceAuthFormBox">
            <div className="workspaceAuthTop">
              <div className="workspaceAuthMini">Lecture AI</div>
              <h2 className="workspaceAuthHeading">
                {authMode === "login" ? "로그인" : "회원가입"}
              </h2>
              <p className="workspaceAuthSub">
                {authMode === "login"
                  ? "계정으로 로그인해서 강의 기록을 이어서 확인하세요."
                  : "새 계정을 만들어 강의 기록을 저장해보세요."}
              </p>
            </div>

            <form
              className="workspaceAuthForm"
              onSubmit={authMode === "login" ? handleLogin : handleSignup}
            >
              {authMode === "signup" && (
                <input
                  className="workspaceInput"
                  type="text"
                  name="name"
                  placeholder="이름"
                  value={authForm.name}
                  onChange={handleAuthInputChange}
                  required
                />
              )}

              <input
                className="workspaceInput"
                type="email"
                name="email"
                placeholder="이메일 아이디"
                value={authForm.email}
                onChange={handleAuthInputChange}
                required
              />

              <input
                className="workspaceInput"
                type="password"
                name="password"
                placeholder="비밀번호"
                value={authForm.password}
                onChange={handleAuthInputChange}
                required
              />

              <button className="workspaceSubmitBtn" type="submit">
                {authMode === "login" ? "로그인" : "회원가입"}
              </button>
            </form>

            {authMessage && (
              <div className="workspaceAuthMessage">{authMessage}</div>
            )}

            <div className="workspaceAuthSwitch">
              {authMode === "login" ? (
                <>
                  계정이 없으신가요?{" "}
                  <span onClick={() => setAuthMode("signup")}>회원가입</span>
                </>
              ) : (
                <>
                  이미 계정이 있으신가요?{" "}
                  <span onClick={() => setAuthMode("login")}>로그인으로 돌아가기</span>
                </>
              )}
            </div>
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
              <h1>Lecture AI 대시보드</h1>
              <p className="subText">
                강의 기록을 저장하고, 복습하고, 분석까지 확인해보세요.
              </p>
            </div>

            <div className="headerActions">
              <span className="badge">
                {user?.name || "사용자"} · {user?.email}
              </span>
              <button className="secondaryBtn" onClick={handleLogout}>
                로그아웃
              </button>
            </div>
          </div>

          <div className="tabRow">
            <button
              className={activeTab === "home" ? "primaryBtn" : "secondaryBtn"}
              onClick={() => setActiveTab("home")}
            >
              홈
            </button>
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
              팀 채팅
            </button>
            <button
              className={activeTab === "analytics" ? "primaryBtn" : "secondaryBtn"}
              onClick={() => setActiveTab("analytics")}
            >
              집중도 분석
            </button>
            <button
              className={activeTab === "exam" ? "primaryBtn" : "secondaryBtn"}
              onClick={() => setActiveTab("exam")}
            >
              시험 중요도
            </button>
          </div>
        </div>

        {activeTab === "home" && (
          <div className="homeGrid">
            <div className="card homeHero">
              <div>
                <h2>환영합니다, {user?.name || "사용자"}님</h2>
                <p className="subText">
                  원하는 기능을 선택해서 강의 기록, 채팅, 분석 기능을 이용해보세요.
                </p>
              </div>

              <div className="homeQuickStats">
                <div className="statCard">
                  <div className="statLabel">저장된 강의</div>
                  <div className="statValue">{savedLectures.length}</div>
                </div>
                <div className="statCard">
                  <div className="statLabel">생성된 퀴즈</div>
                  <div className="statValue">{analytics.quizTotal}</div>
                </div>
              </div>
            </div>

            <div className="homeCardGrid">
              <button className="featureCard" onClick={() => setActiveTab("lecture")}>
                <div className="featureEmoji">📝</div>
                <div className="featureTitle">강의 요약</div>
                <div className="featureDesc">
                  강의 내용을 입력하고 요약, 핵심 키워드, 복습 퀴즈를 생성합니다.
                </div>
              </button>

              <button className="featureCard" onClick={() => setActiveTab("chat")}>
                <div className="featureEmoji">💬</div>
                <div className="featureTitle">팀 채팅</div>
                <div className="featureDesc">
                  팀원과 메시지를 주고받으며 의견을 빠르게 공유할 수 있습니다.
                </div>
              </button>

              <button className="featureCard" onClick={() => setActiveTab("analytics")}>
                <div className="featureEmoji">📊</div>
                <div className="featureTitle">집중도 분석</div>
                <div className="featureDesc">
                  저장된 강의와 퀴즈를 바탕으로 학습 현황과 집중도를 확인합니다.
                </div>
              </button>

              <button className="featureCard" onClick={() => setActiveTab("exam")}>
                <div className="featureEmoji">📚</div>
                <div className="featureTitle">시험 중요도</div>
                <div className="featureDesc">
                  자주 등장한 키워드를 기반으로 시험에 중요한 개념을 정리합니다.
                </div>
              </button>
            </div>
          </div>
        )}

        {activeTab === "lecture" && (
          <div className="gridLayout">
            <div className="leftPanel">
              <div className="card">
                <div className="sectionHeader">
                  <h2>강의 입력</h2>
                  <span className="badge">
                    {selectedLecture ? "저장 강의 열람 중" : "새 강의 작성 중"}
                  </span>
                </div>

                <div className="formGrid">
                  <input
                    className="input"
                    placeholder="강의 제목을 입력하세요"
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
                  <span className="badge">
                    {loadingLectures ? "불러오는 중" : `${savedLectures.length}개`}
                  </span>
                </div>

                <div className="historyList">
                  {savedLectures.length === 0 ? (
                    <div className="emptyBox">저장된 강의가 없습니다.</div>
                  ) : (
                    savedLectures.map((lecture) => (
                      <button
                        key={lecture.id}
                        className={`historyItem ${
                          selectedLecture?.id === lecture.id ? "historyItemActive" : ""
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

                        {!selectedLecture && (
                          <div style={{ marginTop: 12 }}>
                            <input
                              className="input"
                              placeholder="답을 입력하세요"
                              value={answers[idx] || ""}
                              onChange={(e) => handleAnswerChange(idx, e.target.value)}
                            />
                            {answers[idx] && (
                              <div
                                style={{
                                  marginTop: 8,
                                  fontSize: 13,
                                  color: checkCorrect(answers[idx], item.answer)
                                    ? "#16a34a"
                                    : "#dc2626",
                                }}
                              >
                                {checkCorrect(answers[idx], item.answer)
                                  ? "정답입니다!"
                                  : `오답입니다. 예시 답: ${item.answer}`}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="emptyBox">퀴즈가 없습니다.</div>
                  )}
                </div>

                {!selectedLecture && displayQuiz.length > 0 && (
                  <div className="scoreBox">
                    <div className="scoreTitle">현재 점수</div>
                    <div>
                      {result.correct} / {result.total} 정답 · {result.score}점
                    </div>
                  </div>
                )}
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

        {activeTab === "analytics" && (
          <div className="gridLayout">
            <div className="leftPanel">
              <div className="card">
                <h2>학습 요약</h2>
                <div className="statsGrid">
                  <div className="statCard">
                    <div className="statLabel">총 강의 수</div>
                    <div className="statValue">{analytics.totalLectures}</div>
                  </div>
                  <div className="statCard">
                    <div className="statLabel">생성 퀴즈 수</div>
                    <div className="statValue">{analytics.quizTotal}</div>
                  </div>
                  <div className="statCard">
                    <div className="statLabel">참여도</div>
                    <div className="statValue">{analytics.participation}점</div>
                  </div>
                  <div className="statCard">
                    <div className="statLabel">성취도</div>
                    <div className="statValue">{analytics.achievement}점</div>
                  </div>
                </div>
              </div>

              <div className="card">
                <h2>최근 학습 현황</h2>
                {analytics.daily.length === 0 ? (
                  <div className="emptyBox">아직 저장된 학습 기록이 없습니다.</div>
                ) : (
                  <div className="list">
                    {analytics.daily.map((item) => (
                      <div key={item.date} className="itemBox">
                        <div className="historyTitle">{item.date}</div>
                        <div className="historyMeta">{item.count}개 강의 저장</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rightPanel">
              <div className="card">
                <h2>TOP 키워드</h2>
                {analytics.keywordStats.length === 0 ? (
                  <div className="emptyBox">키워드 데이터가 없습니다.</div>
                ) : (
                  <div className="list">
                    {analytics.keywordStats.map((kw, idx) => (
                      <div key={kw.word} className="keywordRow">
                        <div className="keywordRank">{idx + 1}</div>
                        <div className="keywordWord">#{kw.word}</div>
                        <div className="keywordCount">{kw.total}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card">
                <h2>학습 집중도 평가</h2>
                {[
                  {
                    label: "강의 참여도",
                    value: analytics.participation,
                    desc: `총 ${analytics.totalLectures}개 강의 기록`,
                  },
                  {
                    label: "퀴즈 성취도",
                    value: analytics.achievement,
                    desc: `${result.correct} / ${result.total} 정답`,
                  },
                  {
                    label: "종합 집중도",
                    value: analytics.focusScore,
                    desc: "강의 참여도 + 퀴즈 성취도 평균",
                  },
                ].map((item) => (
                  <div key={item.label} className="focusItem">
                    <div className="focusTop">
                      <span className="focusLabel">{item.label}</span>
                      <span
                        className="focusValue"
                        style={{
                          color:
                            item.value >= 70
                              ? "#16a34a"
                              : item.value >= 40
                              ? "#f59e0b"
                              : "#dc2626",
                        }}
                      >
                        {item.value}점
                      </span>
                    </div>
                    <div className="progressTrack">
                      <div
                        className="progressFill"
                        style={{
                          width: `${item.value}%`,
                          background:
                            item.value >= 70
                              ? "#16a34a"
                              : item.value >= 40
                              ? "#f59e0b"
                              : "#dc2626",
                        }}
                      />
                    </div>
                    <div className="historyMeta">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "exam" && (
          <div className="card">
            <div className="sectionHeader">
              <h2>시험 중요도 순위</h2>
              <span className="badge">빈도 + 강의 출현 수 기준</span>
            </div>

            {examImportance.length === 0 ? (
              <div className="emptyBox">
                강의를 먼저 저장하면 중요도를 계산할 수 있습니다.
              </div>
            ) : (
              <div className="list">
                {examImportance.map((item, idx) => {
                  const tier = getTier(item.score);

                  return (
                    <div key={item.word} className="importanceRow">
                      <div className="importanceRank">{idx + 1}</div>

                      <div className="importanceMain">
                        <div className="historyTitle">{item.word}</div>
                        <div className="historyMeta">
                          빈도 {item.frequency}회 · {item.lectureCount}개 강의에서 등장
                        </div>
                      </div>

                      <div className="importanceSide">
                        <span
                          className="importanceTier"
                          style={{
                            color: tier.color,
                            background: tier.bg,
                          }}
                        >
                          {tier.label}
                        </span>
                        <div className="importanceScore">{item.score}점</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;