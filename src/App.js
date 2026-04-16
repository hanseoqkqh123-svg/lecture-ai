import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { io } from "socket.io-client";

const API_BASE_URL =
  process.env.REACT_APP_API_URL || "http://localhost:5000";

const socket = io(API_BASE_URL, {
  autoConnect: false,
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
    id: row.id || row.lecture_id,
    summary: parsed.summary || "",
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    quiz: Array.isArray(parsed.quiz) ? parsed.quiz : [],
  };
}

function checkCorrect(userAnswer, answer) {
  return String(userAnswer || "").trim().toLowerCase() ===
    String(answer || "").trim().toLowerCase();
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
  const [submitted, setSubmitted] = useState({});
  const [gradeResults, setGradeResults] = useState({});
  const [grading, setGrading] = useState({});

  // 강의 수정 모드
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 강의 검색 / 필터
  const [lectureSearch, setLectureSearch] = useState("");
  const [lectureSortOrder, setLectureSortOrder] = useState("newest");

  // 퀴즈 히스토리
  const [quizHistory, setQuizHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [isLiveUploading, setIsLiveUploading] = useState(false);
  const mediaRecorderRef = useRef(null);
  const isStoppingRef = useRef(false);
  const uploadedChunkCountRef = useRef(0);
  const audioChunksRef = useRef([]);
  const quizHistorySavedRef = useRef(false); // 퀴즈 히스토리 중복 저장 방지
  const recognitionRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const segmentIntervalRef = useRef(null);
  const isRecordingRef = useRef(false);
  const liveTranscriptRef = useRef("");
  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [chatInput, setChatInput] = useState("");

  const [messages, setMessages] = useState(() => {
    try {
      const stored = localStorage.getItem("chatMessages");
      return stored ? JSON.parse(stored) : { "team-room": [] };
    } catch {
      return { "team-room": [] };
    }
  });

  const [friends, setFriends] = useState([]);
  const [groupRooms, setGroupRooms] = useState([]);
  const [activeChatTitle, setActiveChatTitle] = useState(null);

  const [friendEmail, setFriendEmail] = useState("");
  const [friendRequests, setFriendRequests] = useState([]);
  const [sentFriendRequests, setSentFriendRequests] = useState([]);

  const isChatSelected = !!currentRoomId;

  useEffect(() => {
  localStorage.setItem("chatMessages", JSON.stringify(messages));
}, [messages]);

  // 친구 목록 가져오기 함수
  const fetchFriends = async () => {
  if (!user?.user_id) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/friends/${user.user_id}`);
    const data = await res.json();
    if (res.ok) setFriends(data);
  } catch (err) {
    console.error("친구 목록 로드 실패:", err);
  }
};

const fetchFriendRequests = async () => {
  if (!user?.user_id) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/friends/requests/${user.user_id}`);
    const data = await res.json();
    if (res.ok) setFriendRequests(Array.isArray(data) ? data : []);
  } catch (err) {
    console.error("받은 친구 요청 로드 실패:", err);
  }
};

const fetchSentFriendRequests = async () => {
  if (!user?.user_id) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/friends/requests/sent/${user.user_id}`);
    const data = await res.json();
    if (res.ok) setSentFriendRequests(Array.isArray(data) ? data : []);
  } catch (err) {
    console.error("보낸 친구 요청 로드 실패:", err);
  }
};

const handleFriendRequest = async () => {
  const email = friendEmail.trim();
  if (!email) return alert("이메일을 입력하세요.");

  try {
    const res = await fetch(`${API_BASE_URL}/api/friends/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.user_id,
        senderName: user.name,
        friendEmail: email,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "친구 요청 실패");

    setFriendEmail("");
    alert(data.message || "친구 요청을 보냈습니다.");
    fetchSentFriendRequests();
  } catch (err) {
    alert(err.message || "친구 요청 실패");
  }
};

const handleRespondFriendRequest = async (requesterId, action) => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/friends/request/respond`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.user_id,
        requesterId,
        responderName: user.name,
        action,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "처리 실패");

    alert(data.message || "처리되었습니다.");
    await fetchFriendRequests();
    await fetchSentFriendRequests();
    await fetchFriends();
  } catch (err) {
    alert(err.message || "처리 실패");
  }
};

const fetchChatRooms = async () => {
  if (!user?.user_id) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/chat/rooms/${user.user_id}`);
    const data = await res.json();

    if (!res.ok) {
      console.error("채팅방 목록 API 에러:", data);
      setGroupRooms([]);
      return;
    }

    setGroupRooms(Array.isArray(data) ? data : []);
  } catch (err) {
    console.error("채팅방 목록 로드 실패:", err);
    setGroupRooms([]);
  }
};

  // App.js 내의 enterPrivateChat 함수 수정
  const resetChatSelection = () => {
  setCurrentRoomId(null);
  setActiveChatTitle(null);
  setChatInput("");
};

const selectChatRoom = (roomId, title) => {
  setCurrentRoomId(roomId);
  setActiveChatTitle(title);
  setChatInput("");

  setMessages((prev) => ({
    ...prev,
    [roomId]: prev[roomId] || [],
  }));
};

const enterPrivateChat = (friend) => {
  if (!user || !friend) return;

  const ids = [Number(user.user_id), Number(friend.user_id)].sort((a, b) => a - b);
  const roomId = `private_${ids[0]}_${ids[1]}`;

  setActiveTab("chat");
  selectChatRoom(roomId, friend.name);
};

  // 탭이 'chat'이거나 친구 추가 성공 시 호출
  useEffect(() => {
  if (activeTab === "chat") {
    fetchFriends();
    fetchFriendRequests();
    fetchSentFriendRequests();
    fetchChatRooms();
  }
}, [activeTab, user]);

  // 방이 바뀔 때마다 해당 방의 메시지를 서버에서 가져옴
  useEffect(() => {
    if (activeTab === "chat" && currentRoomId) {
      fetch(`${API_BASE_URL}/api/chat/messages/${currentRoomId}`)
        .then(res => res.json())
        .then(data => {
          const normalized = data.map(m => ({
            ...m,
            text: m.text ?? m.message,
          }));
          setMessages(prev => ({ ...prev, [currentRoomId]: normalized }));
        })
        .catch(err => console.error("메시지 로드 실패:", err));
    }
  }, [currentRoomId, activeTab]);

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
    if (!user?.user_id) {
      if (socket.connected) socket.disconnect();
      return;
    }

    if (!socket.connected) socket.connect();

    console.log("join_self 실행:", user.user_id);

    // 개인 방 및 현재 채팅방 동시 접속
    socket.emit("join_self", user.user_id);

    if (currentRoomId) socket.emit("join_room", currentRoomId);

    const handleMessage = (data) => {
  const normalized = {
    ...data,
    id: data.id || null,
    client_temp_id: data.client_temp_id || null,
    roomId: String(data.roomId ?? data.room_id),
    text: data.text ?? data.message,
    created_at: data.created_at || new Date().toISOString(),
  };

  setMessages((prev) => {
    const roomKey = normalized.roomId;
    const prevMsgs = prev[roomKey] || [];

    const isDuplicate = prevMsgs.some((m) => {
      if (normalized.id && m.id) {
        return String(m.id) === String(normalized.id);
      }
      if (normalized.client_temp_id && m.client_temp_id) {
        return String(m.client_temp_id) === String(normalized.client_temp_id);
      }
      return false;
    });

    if (isDuplicate) return prev;

    return {
      ...prev,
      [roomKey]: [...prevMsgs, normalized],
    };
  });
};

    const handleNotification = (data) => {
  if (
    data?.type === "friend_request" ||
    data?.type === "friend_accepted" ||
    data?.type === "friend_rejected"
  ) {
    fetchFriendRequests();
    fetchSentFriendRequests();
    fetchFriends();
  }

  alert(`[알림] ${data.message}`);
};

    socket.on("receive_message", handleMessage);
    socket.on("new_notification", handleNotification);

    return () => {
      socket.off("receive_message", handleMessage);
      socket.off("new_notification", handleNotification);
    };
  }, [user, currentRoomId]);

  useEffect(() => {
    if (isLoggedIn && user?.user_id) {
      fetchLectures();
      fetchQuizHistory();
    }
  }, [isLoggedIn, user]);

  useEffect(() => {
    if (activeTab === "quizhistory" && user?.user_id) {
      fetchQuizHistory();
    }
  }, [activeTab]);

  async function fetchLectures() {
    if (!user?.user_id) return;

    setLoadingLectures(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/lectures/${user.user_id}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "강의 목록 불러오기 실패");
      }
      console.log("userId:", user?.user_id);

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
  localStorage.removeItem("chatMessages");

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
  setSubmitted({});
  setGradeResults({});
  setGrading({});
  setIsEditMode(false);
  setLectureSearch("");
  setQuizHistory([]);
  setSelectedHistoryItem(null);

  setCurrentRoomId(null);
  setActiveChatTitle(null);
  setChatInput("");
  setFriends([]);
  setGroupRooms([]);
  setMessages({ "team-room": [] });
}

  async function handleGenerateSummary() {
    if (!lectureTitle.trim() || !lectureText.trim()) {
      setLectureMessage("강의 제목과 내용을 입력해주세요.");
      return;
    }

    setIsSummarizing(true);
    setLectureMessage("AI가 요약 중...");

    try {
      const res = await fetch(`${API_BASE_URL}/api/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: lectureText }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "요약 생성 실패");
      }

      setSummary(data.summary || "");
      setKeywords(Array.isArray(data.keywords) ? data.keywords : []);
      setQuiz(Array.isArray(data.quiz) ? data.quiz : []);
      setSelectedLecture(null);
      setAnswers({});
      setLectureMessage("AI 요약 생성 완료 ✅");
    } catch (error) {
      setLectureMessage(error.message || "요약 생성 중 오류가 발생했습니다.");
    } finally {
      setIsSummarizing(false);
    }
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

      if (data.id) {
        setSelectedLecture({
          id: data.id,
          title: lectureTitle,
          raw_text: lectureText,
          summary,
          keywords,
          quiz,
        });
      }
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
    setSubmitted({});
    setGradeResults({});
    setGrading({});
    setIsEditMode(false);
    setLectureMessage("저장된 강의를 불러왔습니다.");
    setActiveTab("lecture");
    quizHistorySavedRef.current = false;
  }

  async function handleDeleteLecture(e, lectureId) {
    e.stopPropagation();
    if (!window.confirm("이 강의를 삭제하시겠습니까?")) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/lectures/${lectureId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.user_id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "강의 삭제 실패");

      if (selectedLecture?.id === lectureId) {
        setSelectedLecture(null);
        setLectureTitle("");
        setLectureText("");
        setSummary("");
        setKeywords([]);
        setQuiz([]);
        setAnswers({});
        setSubmitted({});
        setGradeResults({});
        setGrading({});
      }

      setLectureMessage("강의가 삭제되었습니다.");
      await fetchLectures();
    } catch (error) {
      setLectureMessage(error.message || "강의 삭제 중 오류가 발생했습니다.");
    }
  }

  async function handleUpdateLecture() {
    if (!lectureTitle.trim() || !lectureText.trim()) {
      setLectureMessage("제목과 내용을 입력해주세요.");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/lectures/${selectedLecture.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.user_id,
          title: lectureTitle,
          raw_text: lectureText,
          summary_data: { summary, keywords, quiz },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "수정 실패");
      setIsEditMode(false);
      setLectureMessage("강의가 수정되었습니다. ✅");
      await fetchLectures();
      // 선택된 강의 상태 업데이트
      setSelectedLecture((prev) => ({
        ...prev,
        title: lectureTitle,
        raw_text: lectureText,
        summary,
        keywords,
        quiz,
      }));
    } catch (error) {
      setLectureMessage(error.message || "강의 수정 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function fetchQuizHistory() {
    if (!user?.user_id) return;
    setLoadingHistory(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/quiz-history/${user.user_id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "히스토리 조회 실패");
      setQuizHistory(
        (data || []).map((item) => ({
          ...item,
          results: (() => {
            try { return typeof item.results === "string" ? JSON.parse(item.results) : item.results || []; }
            catch { return []; }
          })(),
        }))
      );
    } catch (err) {
      console.error("퀴즈 히스토리 조회 오류:", err);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function deleteQuizHistory(historyId) {
    if (!window.confirm("이 퀴즈 기록을 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/quiz-history/${historyId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.user_id }),
      });
      if (!res.ok) throw new Error("삭제 실패");
      if (selectedHistoryItem?.id === historyId) setSelectedHistoryItem(null);
      await fetchQuizHistory();
    } catch (err) {
      console.error("퀴즈 히스토리 삭제 오류:", err);
    }
  }

  function handleRetryWrong() {
    const wrongIdxs = Object.entries(gradeResults)
      .filter(([, v]) => !v.isCorrect)
      .map(([k]) => Number(k));

    const newAnswers = { ...answers };
    const newSubmitted = { ...submitted };
    const newGradeResults = { ...gradeResults };
    const newGrading = { ...grading };

    wrongIdxs.forEach((idx) => {
      delete newAnswers[idx];
      delete newSubmitted[idx];
      delete newGradeResults[idx];
      delete newGrading[idx];
    });

    setAnswers(newAnswers);
    setSubmitted(newSubmitted);
    setGradeResults(newGradeResults);
    setGrading(newGrading);
    quizHistorySavedRef.current = false;
  }

  function handleRetryAll() {
    setAnswers({});
    setSubmitted({});
    setGradeResults({});
    setGrading({});
    quizHistorySavedRef.current = false;
  }
//여기
  
  const getSupportedMimeType = () => {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];

  return (
    candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) ||
    "audio/webm"
  );
};

const uploadSegment = async (blob, fileName) => {
  if (!blob || blob.size < 3000) return;
  if (!isRecordingRef.current) return;

  setIsLiveUploading(true);
  setIsTranscribing(true);

  try {
    const formData = new FormData();
    formData.append("audio", blob, fileName);
    formData.append("userId", String(user?.user_id || "default"));

    const res = await fetch(`${API_BASE_URL}/api/transcribe`, {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "실시간 STT 실패");
    }

    if (!isRecordingRef.current) return;

    const cleaned = String(data.text || "")
      .replace(/\s+/g, " ")
      .trim();

    if (cleaned) {
      liveTranscriptRef.current = `${liveTranscriptRef.current} ${cleaned}`.trim();
      setLiveTranscript(liveTranscriptRef.current);
      setLectureMessage("실시간 변환 중... 🎤");
    }
  } catch (err) {
    console.error("실시간 세그먼트 업로드 실패:", err);
    setLectureMessage(err.message || "실시간 변환 중 일부 구간 실패");
  } finally {
    setIsLiveUploading(false);
    setIsTranscribing(false);
  }
};

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setLectureMessage("이 브라우저는 마이크를 지원하지 않습니다.");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: false,
      },
    });

    recordingStreamRef.current = stream;
    isRecordingRef.current = true;
    setIsRecording(true);
    setLectureText("");
    setLiveTranscript("");
    liveTranscriptRef.current = "";
    setLectureMessage("실시간 고정밀 녹음 중... 🎙️");

    const mimeType = getSupportedMimeType();
    const ext = mimeType.includes("ogg")
      ? "ogg"
      : mimeType.includes("mp4")
      ? "mp4"
      : "webm";

    const recordOneChunk = () => {
      if (!isRecordingRef.current || !recordingStreamRef.current) return;

      const recorder = new MediaRecorder(recordingStreamRef.current, { mimeType });
      mediaRecorderRef.current = recorder;

      const chunkParts = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunkParts.push(e.data);
        }
      };

      recorder.onstop = async () => {
        if (chunkParts.length > 0) {
          const completeBlob = new Blob(chunkParts, { type: mimeType });
          await uploadSegment(
            completeBlob,
            `segment_${Date.now()}.${ext}`
          );
        }

        if (isRecordingRef.current) {
          recordOneChunk();
        }
      };

      recorder.onerror = (event) => {
        console.error("MediaRecorder 오류:", event);
        setLectureMessage("녹음기 오류가 발생했습니다.");
      };

      recorder.start();

      setTimeout(() => {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      }, 4000);
    };

    recordOneChunk();
  } catch (err) {
    console.error("녹음 시작 오류:", err);
    setLectureMessage(`녹음 오류: ${err.message}`);
    setIsRecording(false);
    isRecordingRef.current = false;
  }
}

function stopRecording() {
  isRecordingRef.current = false;
  setIsRecording(false);
  setIsLiveUploading(false);

  if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
    mediaRecorderRef.current.stop();
  }

  if (recordingStreamRef.current) {
    recordingStreamRef.current.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  }

  if (liveTranscriptRef.current.trim()) {
    setLectureText(liveTranscriptRef.current.trim());
  }

  setLectureMessage("음성 기록 완료 ✅");
}
  //여기
  function handleAnswerChange(index, value) {
    setAnswers((prev) => ({ ...prev, [index]: value }));
  }

  async function handleSubmitAnswer(idx, question, correctAnswer) {
    const userAnswer = (answers[idx] || "").trim();
    if (!userAnswer) return;

    // 강의가 저장되지 않은 상태면 채점은 하되 히스토리 저장 불가 안내
    if (!selectedLecture?.id) {
      setLectureMessage("⚠️ 강의를 먼저 저장해야 퀴즈 기록이 히스토리에 남습니다.");
    }

    setSubmitted((prev) => ({ ...prev, [idx]: true }));
    setGrading((prev) => ({ ...prev, [idx]: true }));

    const activeQuiz = quiz.length > 0 ? quiz : (selectedLecture?.quiz || []);

    try {
      const res = await fetch(`${API_BASE_URL}/api/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, correctAnswer, userAnswer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "채점 실패");

      // 마지막 답변을 포함한 최신 answers 구성
      const latestAnswers = { ...answers, [idx]: userAnswer };

      setGradeResults((prev) => {
        const updated = { ...prev, [idx]: { isCorrect: data.isCorrect, feedback: data.feedback } };

        // 모든 문제 제출 완료 시 히스토리 자동 저장 (한 세션당 1회만)
        const quizLen = activeQuiz.length;
        if (quizLen > 0 && Object.keys(updated).length === quizLen && !quizHistorySavedRef.current) {
          quizHistorySavedRef.current = true;
          const correct = Object.values(updated).filter((r) => r.isCorrect).length;
          const score = Math.round((correct / quizLen) * 100);
          const resultsArr = activeQuiz.map((item, i) => ({
            question: item.question,
            answer: item.answer,
            userAnswer: latestAnswers[i] || "",
            isCorrect: updated[i]?.isCorrect ?? null,
            feedback: updated[i]?.feedback || "",
          }));
          fetch(`${API_BASE_URL}/api/quiz-history`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: user.user_id,
              lecture_id: selectedLecture?.id || null,
              lecture_title: selectedLecture?.title || lectureTitle || "제목 없음",
              score,
              correct,
              total: quizLen,
              results: resultsArr,
            }),
          }).catch((e) => console.error("히스토리 저장 실패:", e));
        }
        return updated;
      });
    } catch (err) {
      setGradeResults((prev) => ({
        ...prev,
        [idx]: { isCorrect: false, feedback: "채점 중 오류가 발생했습니다." },
      }));
    } finally {
      setGrading((prev) => ({ ...prev, [idx]: false }));
    }
  }

  const result = useMemo(() => {
    const total = Object.keys(gradeResults).length;
    const correct = Object.values(gradeResults).filter((r) => r.isCorrect).length;
    return {
      total,
      correct,
      score: total > 0 ? Math.round((correct / total) * 100) : 0,
    };
  }, [gradeResults]);

  function handleSendMessage() {
  if (!currentRoomId || !user) return;

  const text = chatInput.trim();
  if (!text) return;

  const client_temp_id = `${user.user_id}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  socket.emit("send_message", {
    roomId: currentRoomId,
    sender_id: user.user_id,
    sender_name: user.name || "익명",
    text,
    client_temp_id,
  });

  setChatInput("");
}

    



  const displayKeywords = selectedLecture ? selectedLecture.keywords || [] : keywords;
  // 재요약 후 quiz state가 업데이트되면 그걸 우선 사용, 없으면 selectedLecture의 quiz
  const displayQuiz = quiz.length > 0 ? quiz : (selectedLecture?.quiz || []);

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

    // 퀴즈 히스토리 전체 평균 점수
    const achievement = quizHistory.length > 0
      ? Math.round(quizHistory.reduce((sum, h) => sum + (h.score || 0), 0) / quizHistory.length)
      : 0;

    return {
      totalLectures,
      quizTotal,
      keywordStats,
      daily,
      participation: Math.min(totalLectures * 10, 100),
      achievement,
      focusScore: Math.round((Math.min(totalLectures * 10, 100) + achievement) / 2),
    };
  }, [savedLectures, quizHistory]);

  const examImportance = useMemo(
    () => getExamImportanceData(savedLectures),
    [savedLectures]
  );

  const filteredLectures = useMemo(() => {
    let list = [...savedLectures];
    if (lectureSearch.trim()) {
      const q = lectureSearch.trim().toLowerCase();
      list = list.filter(
        (l) =>
          l.title?.toLowerCase().includes(q) ||
          (Array.isArray(l.keywords) && l.keywords.some((k) => k.toLowerCase().includes(q)))
      );
    }
    list.sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return lectureSortOrder === "oldest" ? dateA - dateB : dateB - dateA;
    });
    return list;
  }, [savedLectures, lectureSearch, lectureSortOrder]);

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

          <div className="tabRow" >
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
              onClick={() => {
                setActiveTab("chat");
                resetChatSelection();
              }}
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
            <button
              className={activeTab === "quizhistory" ? "primaryBtn" : "secondaryBtn"}
              onClick={() => setActiveTab("quizhistory")}
            >
              퀴즈 히스토리
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

              <button className="featureCard" onClick={() => setActiveTab("quizhistory")}>
                <div className="featureEmoji">📋</div>
                <div className="featureTitle">퀴즈 히스토리</div>
                <div className="featureDesc">
                  이전에 풀었던 퀴즈 결과를 확인하고 오답을 복습합니다.
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
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {selectedLecture && (
                      <span
                        className="badge"
                        style={{
                          background: isEditMode ? "#fef3c7" : "#eff6ff",
                          color: isEditMode ? "#d97706" : "#2563eb",
                          borderColor: isEditMode ? "#fcd34d" : "#dbeafe",
                        }}
                      >
                        {isEditMode ? "✏️ 수정 중" : "저장 강의 열람 중"}
                      </span>
                    )}
                    {!selectedLecture && <span className="badge">새 강의 작성 중</span>}
                    {selectedLecture && !isEditMode && (
                      <button
                        className="secondaryBtn"
                        style={{ padding: "8px 14px", fontSize: 13 }}
                        onClick={() => setIsEditMode(true)}
                      >
                        ✏️ 수정
                      </button>
                    )}
                    {selectedLecture && isEditMode && (
                      <button
                        className="secondaryBtn"
                        style={{ padding: "8px 14px", fontSize: 13 }}
                        onClick={() => {
                          setIsEditMode(false);
                          handleSelectLecture(selectedLecture);
                        }}
                      >
                        취소
                      </button>
                    )}
                  </div>
                </div>

                <div className="formGrid">
                  <input
                    className="input"
                    placeholder="강의 제목을 입력하세요"
                    value={lectureTitle}
                    onChange={(e) => setLectureTitle(e.target.value)}
                    disabled={selectedLecture && !isEditMode}
                  />

                  <textarea
                    className="textarea"
                    placeholder="강의 내용을 입력하세요"
                    value={lectureText}
                    onChange={(e) => setLectureText(e.target.value)}
                    rows={10}
                    disabled={selectedLecture && !isEditMode}
                  />

                  {isRecording && (
                    <div
                      style={{
                        marginTop: "10px",
                        padding: "12px",
                        borderRadius: "10px",
                        background: "#f8fafc",
                        border: "1px solid #e5e7eb",
                        fontSize: "14px",
                        color: "#111827",
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.6,
                      }}
                    >
                      <strong>실시간 변환 중:</strong>
                      <div style={{ marginTop: "6px" }}>
                        {liveTranscript || "말하면 여기에 바로 표시됩니다..."}
                      </div>
                    </div>
                  )}

                  <div className="buttonRow">
                    {!selectedLecture && (
                      <>
                        {!isRecording ? (
                          <button
                            className="secondaryBtn"
                            onClick={startRecording}
                            disabled={isTranscribing || isSummarizing}
                          >
                            🎙️ 녹음 시작
                          </button>
                        ) : (
                          <button className="secondaryBtn" onClick={stopRecording}>
                            ⏹️ 녹음 종료
                          </button>
                        )}
                        {isTranscribing && (
                          <span className="badge">Whisper 변환 중...</span>
                        )}
                        
                        <button
                          className="primaryBtn"
                          onClick={handleGenerateSummary}
                          disabled={isSummarizing || isRecording || isTranscribing}
                        >
                          {isSummarizing ? "AI 요약 중..." : "✨ AI 요약 생성"}
                        </button>
                        <button
                          className="secondaryBtn"
                          onClick={handleSaveLecture}
                          disabled={isSummarizing}
                        >
                          저장
                        </button>
                      </>
                    )}

                    {selectedLecture && isEditMode && (
                      <>
                        <button
                          className="primaryBtn"
                          onClick={handleGenerateSummary}
                          disabled={isSummarizing}
                        >
                          {isSummarizing ? "AI 요약 중..." : "✨ AI 재요약"}
                        </button>
                        <button
                          className="primaryBtn"
                          onClick={handleUpdateLecture}
                          disabled={isSaving || isSummarizing}
                          style={{ background: "linear-gradient(135deg, #d97706, #b45309)" }}
                        >
                          {isSaving ? "저장 중..." : "💾 수정 저장"}
                        </button>
                      </>
                    )}

                    {selectedLecture && !isEditMode && (
                      <button
                        className="secondaryBtn"
                        onClick={() => {
                          setSelectedLecture(null);
                          setLectureTitle("");
                          setLectureText("");
                          setSummary("");
                          setKeywords([]);
                          setQuiz([]);
                          setAnswers({});
                          setSubmitted({});
                          setGradeResults({});
                          setGrading({});
                          setLectureMessage("");
                          quizHistorySavedRef.current = false;
                        }}
                      >
                        + 새 강의 작성
                      </button>
                    )}
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
                    {loadingLectures ? "불러오는 중" : `${filteredLectures.length} / ${savedLectures.length}개`}
                  </span>
                </div>

                {/* 검색 + 정렬 */}
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <input
                    className="input"
                    placeholder="🔍 제목 또는 키워드 검색"
                    value={lectureSearch}
                    onChange={(e) => setLectureSearch(e.target.value)}
                    style={{ fontSize: 14 }}
                  />
                  <select
                    className="input"
                    value={lectureSortOrder}
                    onChange={(e) => setLectureSortOrder(e.target.value)}
                    style={{ width: "auto", minWidth: 90, fontSize: 13, cursor: "pointer" }}
                  >
                    <option value="newest">최신순</option>
                    <option value="oldest">오래된순</option>
                  </select>
                </div>

                <div className="historyList">
                  {filteredLectures.length === 0 ? (
                    <div className="emptyBox">
                      {lectureSearch ? "검색 결과가 없습니다." : "저장된 강의가 없습니다."}
                    </div>
                  ) : (
                    filteredLectures.map((lecture) => (
                      <div key={lecture.id} style={{ position: "relative" }}>
                        <button
                          className={`historyItem ${selectedLecture?.id === lecture.id ? "historyItemActive" : ""}`}
                          style={{ paddingRight: 48 }}
                          onClick={() => handleSelectLecture(lecture)}
                        >
                          <div className="historyTitle">{lecture.title}</div>
                          <div className="historyMeta">
                            {lecture.created_at
                              ? new Date(lecture.created_at).toLocaleString("ko-KR")
                              : "시간 정보 없음"}
                          </div>
                        </button>
                        <button
                          onClick={(e) => handleDeleteLecture(e, lecture.id)}
                          title="강의 삭제"
                          style={{
                            position: "absolute",
                            top: "50%",
                            right: 12,
                            transform: "translateY(-50%)",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontSize: 16,
                            color: "#9ca3af",
                            padding: "4px 6px",
                            borderRadius: 8,
                            lineHeight: 1,
                            transition: "color 0.15s ease, background 0.15s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#dc2626";
                            e.currentTarget.style.background = "#fef2f2";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = "#9ca3af";
                            e.currentTarget.style.background = "none";
                          }}
                        >
                          🗑️
                        </button>
                      </div>
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
                    displayQuiz.map((item, idx) => {
                      const grade = gradeResults[idx];
                      const isSubmitted = submitted[idx];
                      const isGrading = grading[idx];

                      return (
                        <div className="quizItem" key={idx}>
                          <div className="quizQuestion">
                            Q{idx + 1}. {item.question}
                          </div>

                          {!isEditMode && (
                            <div style={{ marginTop: 12 }}>
                              <div style={{ display: "flex", gap: 8 }}>
                                <input
                                  className="input"
                                  placeholder="답을 입력하세요"
                                  value={answers[idx] || ""}
                                  onChange={(e) => handleAnswerChange(idx, e.target.value)}
                                  disabled={isSubmitted}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !isSubmitted)
                                      handleSubmitAnswer(idx, item.question, item.answer);
                                  }}
                                  style={{ opacity: isSubmitted ? 0.7 : 1 }}
                                />
                                {!isSubmitted && (
                                  <button
                                    className="primaryBtn"
                                    style={{ whiteSpace: "nowrap", padding: "12px 18px" }}
                                    onClick={() => handleSubmitAnswer(idx, item.question, item.answer)}
                                    disabled={!answers[idx]?.trim()}
                                  >
                                    제출
                                  </button>
                                )}
                              </div>

                              {isGrading && (
                                <div style={{ marginTop: 8, fontSize: 13, color: "#6b7280" }}>
                                  ⏳ GPT가 채점 중...
                                </div>
                              )}

                              {isSubmitted && !isGrading && grade && (
                                <div style={{ marginTop: 10 }}>
                                  <div
                                    style={{
                                      fontSize: 13,
                                      fontWeight: 700,
                                      color: grade.isCorrect ? "#16a34a" : "#dc2626",
                                      marginBottom: 6,
                                    }}
                                  >
                                    {grade.isCorrect ? "✅ 정답입니다!" : "❌ 오답입니다."}
                                  </div>
                                  <div style={{ fontSize: 13, color: "#4b5563", marginBottom: 6 }}>
                                    💬 {grade.feedback}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 13,
                                      color: "#6b7280",
                                      background: "#f8fafc",
                                      border: "1px solid #e5e7eb",
                                      borderRadius: 10,
                                      padding: "8px 12px",
                                    }}
                                  >
                                    📖 모범 답안: {item.answer}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {isEditMode && (
                            <div className="quizAnswer">예상 답변: {item.answer}</div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="emptyBox">퀴즈가 없습니다.</div>
                  )}
                </div>

                {!isEditMode && displayQuiz.length > 0 && Object.keys(gradeResults).length > 0 && (
                  <div className="scoreBox">
                    <div className="scoreTitle">현재 점수</div>
                    <div style={{ marginBottom: 12 }}>
                      {result.correct} / {result.total} 정답 · {result.score}점
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {Object.values(gradeResults).some((r) => !r.isCorrect) && (
                        <button
                          className="secondaryBtn"
                          style={{ fontSize: 13, padding: "10px 14px" }}
                          onClick={handleRetryWrong}
                        >
                          ❌ 오답만 재도전
                        </button>
                      )}
                      <button
                        className="secondaryBtn"
                        style={{ fontSize: 13, padding: "10px 14px" }}
                        onClick={handleRetryAll}
                      >
                        🔄 전체 다시 풀기
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}



    {/* 채팅 탭 컨텐츠 */}
        {activeTab === "chat" && (
          <div className="gridLayout" style={{ gridTemplateColumns: '300px 1fr', gap: '20px', height: '600px' }}>
            {/* 1. 왼쪽 사이드바: 친구 추가 및 목록 */}
            <div className="card" style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: '18px', marginBottom: '16px' }}>친구 추가</h3>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                <input
                  className="input"
                  placeholder="친구 이메일 입력"
                  value={friendEmail}
                  onChange={(e) => setFriendEmail(e.target.value)}
                  style={{ fontSize: '13px', flex: 1, height: '40px' }}
                />
                <button
                  className="primaryBtn"
                  style={{ height: '40px', padding: '0 15px' }}
                  onClick={handleFriendRequest}
                >
                  추가
                </button>
              </div>
              <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>받은 친구 요청</h3>
              {friendRequests.length === 0 ? (
                <div className="emptyBox" style={{ marginBottom: '16px' }}>
                  받은 친구 요청이 없습니다.
                </div>
              ) : (
                <div className="historyList" style={{ marginBottom: '16px' }}>
                  {friendRequests.map((reqUser) => (
                    <div
                      key={reqUser.user_id}
                      className="historyItem"
                      style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
                    >
                      <div style={{ flex: 1 }}>
                        <div className="historyTitle">{reqUser.name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{reqUser.email}</div>
                      </div>

                      <button
                        className="primaryBtn"
                        style={{ padding: '4px 10px', fontSize: '12px' }}
                        onClick={() => handleRespondFriendRequest(reqUser.user_id, "accepted")}
                      >
                        수락
                      </button>

                      <button
                        className="secondaryBtn"
                        style={{ padding: '4px 10px', fontSize: '12px' }}
                        onClick={() => handleRespondFriendRequest(reqUser.user_id, "rejected")}
                      >
                        거절
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>보낸 친구 요청</h3>
              {sentFriendRequests.length === 0 ? (
                <div className="emptyBox" style={{ marginBottom: '16px' }}>
                  보낸 친구 요청이 없습니다.
                </div>
              ) : (
                <div className="historyList" style={{ marginBottom: '16px' }}>
                  {sentFriendRequests.map((reqUser) => (
                    <div
                      key={reqUser.user_id}
                      className="historyItem"
                      style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
                    >
                      <div style={{ flex: 1 }}>
                        <div className="historyTitle">{reqUser.name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{reqUser.email}</div>
                      </div>
                      <span className="badge">대기중</span>
                    </div>
                  ))}
                </div>
              )}

              <h3 style={{ fontSize: '16px', marginTop: '20px', marginBottom: '12px' }}>내 친구 (단체방 만들기)</h3>
              <div style={{ marginBottom: '10px' }}>
                <input id="groupRoomName" className="input" placeholder="단체방 이름" style={{ marginBottom: '5px', fontSize: '12px' }} />
                <button className="primaryBtn" style={{ width: '100%', fontSize: '12px' }} onClick={() => {
                  const selectedIds = Array.from(document.querySelectorAll('.friend-check:checked')).map(el => el.value);
                  const roomName = document.getElementById('groupRoomName').value || "새 단체방";
                  if (selectedIds.length < 1) return alert("대화할 상대를 선택하세요.");
                  fetch(`${API_BASE_URL}/api/chat/rooms`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ roomName, members: [...selectedIds, user.user_id] })
                  })
                    .then(res => res.json())
                    .then(data => {
                      alert(`${data.roomName} 생성 완료!`);
                      fetchChatRooms();
                      selectChatRoom(data.roomId, data.roomName);
                    });
                }}>선택한 친구와 단체방 만들기</button>
              </div>

              <div className="historyList">
                <button
                  className={`historyItem ${currentRoomId === "team-room" ? "historyItemActive" : ""}`}
                  onClick={() => selectChatRoom("team-room", "전체 팀 채팅방")}
                  style={{ width: '100%', textAlign: 'left', marginBottom: '10px' }}
                >
                  <div className="historyTitle">🌐 전체 팀 채팅방</div>
                </button>

                <h3 style={{ fontSize: '16px', marginTop: '16px', marginBottom: '12px' }}>내 단체방</h3>
                {groupRooms.length === 0 ? (
                  <div className="emptyBox" style={{ marginBottom: '12px' }}>생성된 단체방이 없습니다.</div>
                ) : (
                  groupRooms.map((room) => (
                    <button
                      key={room.room_id}
                      className={`historyItem ${currentRoomId === room.room_id ? "historyItemActive" : ""}`}
                      onClick={() => selectChatRoom(room.room_id, room.room_name)}
                      style={{ width: '100%', textAlign: 'left', marginBottom: '10px' }}
                    >
                      <div className="historyTitle">👥 {room.room_name}</div>
                    </button>
                  ))
                )}
                {friends.map(friend => (
                  <div key={friend.user_id} className="historyItem" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input type="checkbox" className="friend-check" value={friend.user_id} />
                    <div style={{ flex: 1 }}>
                      <div className="historyTitle">{friend.name}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{friend.email}</div>
                    </div>
                    <button 
                      className="primaryBtn" 
                      style={{ padding: '4px 12px', fontSize: '12px', cursor: 'pointer' }}
                      onClick={(e) => {
                        e.preventDefault(); 
                        enterPrivateChat(friend);
                      }}
                    >
                      대화
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. 오른쪽 메인: 실시간 채팅창 */}
            {isChatSelected ? (
  <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden' }}>
    <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee' }}>
      <h2 style={{ margin: 0, fontSize: '18px' }}>{activeChatTitle}</h2>
    </div>

    <div className="chatBox" style={{ flex: 1, padding: '20px', background: '#f8fafc', overflowY: 'auto' }}>
      {(messages[currentRoomId] || []).length > 0 ? (
        (messages[currentRoomId] || []).map((msg, idx) => {
          const isMine = String(msg.sender_id) === String(user?.user_id);

          return (
            <div key={msg.id || msg.client_temp_id || idx} style={{ textAlign: isMine ? 'right' : 'left', marginBottom: '16px' }}>
              {!isMine && <div style={{ fontSize: '12px', color: '#666' }}>{msg.sender_name}</div>}
              <div
                style={{
                  display: 'inline-block',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: isMine ? '#2563eb' : '#fff',
                  color: isMine ? '#fff' : '#000',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                }}
              >
                {msg.text ?? msg.message}
              </div>
            </div>
          );
        })
      ) : (
        <div className="emptyBox">대화를 시작해보세요!</div>
      )}
    </div>

    <div style={{ padding: '16px', borderTop: '1px solid #eee', display: 'flex', gap: '10px' }}>
      <input
        className="input"
        value={chatInput}
        onChange={(e) => setChatInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
        placeholder="메시지를 입력하세요..."
      />
      <button className="primaryBtn" onClick={handleSendMessage}>전송</button>
    </div>
  </div>
) : (
  <div
    className="card"
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: '8px'
    }}
  >
    <h2 style={{ margin: 0, fontSize: '20px', color: '#334155' }}>
      대화할 친구를 선택해주세요!
    </h2>
  </div>
)}
          </div>
        )}

        {/* 1. 집중도 분석 탭 */}
        {activeTab === "analytics" && (
          <div className="gridLayout" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', width: '100%' }}>
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
                  { label: "강의 참여도", value: analytics.participation, desc: `총 ${analytics.totalLectures}개 강의 기록` },
                  { label: "퀴즈 성취도", value: analytics.achievement, desc: quizHistory.length > 0 ? `퀴즈 ${quizHistory.length}회 평균 점수` : "퀴즈 기록 없음" },
                  { label: "종합 집중도", value: analytics.focusScore, desc: "강의 참여도 + 퀴즈 성취도 평균" },
                ].map((item) => (
                  <div key={item.label} className="focusItem">
                    <div className="focusTop">
                      <span className="focusLabel">{item.label}</span>
                      <span className="focusValue" style={{ color: item.value >= 70 ? "#16a34a" : item.value >= 40 ? "#f59e0b" : "#dc2626" }}>
                        {item.value}점
                      </span>
                    </div>
                    <div className="progressTrack">
                      <div className="progressFill" style={{ width: `${item.value}%`, background: item.value >= 70 ? "#16a34a" : item.value >= 40 ? "#f59e0b" : "#dc2626" }} />
                    </div>
                    <div className="historyMeta">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 2. 시험 중요도 탭 */}
        {activeTab === "exam" && (
          <div className="card" style={{ width: '100%' }}>
            <div className="sectionHeader">
              <h2>시험 중요도 순위</h2>
              <span className="badge">빈도 + 강의 출현 수 기준</span>
            </div>
            {examImportance.length === 0 ? (
              <div className="emptyBox">강의를 먼저 저장하면 중요도를 계산할 수 있습니다.</div>
            ) : (
              <div className="list">
                {examImportance.map((item, idx) => {
                  const tier = getTier(item.score);
                  return (
                    <div key={item.word} className="importanceRow">
                      <div className="importanceRank">{idx + 1}</div>
                      <div className="importanceMain">
                        <div className="historyTitle">{item.word}</div>
                        <div className="historyMeta">빈도 {item.frequency}회 · {item.lectureCount}개 강의에서 등장</div>
                      </div>
                      <div className="importanceSide">
                        <span className="importanceTier" style={{ color: tier.color, background: tier.bg }}>{tier.label}</span>
                        <div className="importanceScore">{item.score}점</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 3. 퀴즈 히스토리 탭 */}
        {activeTab === "quizhistory" && (
          <div className="gridLayout" style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '20px', width: '100%' }}>
            <div className="leftPanel">
              <div className="card">
                <div className="sectionHeader">
                  <h2>퀴즈 히스토리</h2>
                  <span className="badge">{loadingHistory ? "불러오는 중" : `${quizHistory.length}회`}</span>
                </div>
                {quizHistory.length === 0 ? (
                  <div className="emptyBox">아직 퀴즈 기록이 없습니다.<br/>강의를 불러와 퀴즈를 풀면 자동으로 저장됩니다.</div>
                ) : (
                  <div className="historyList">
                    {quizHistory.map((item) => {
                      const isSelected = selectedHistoryItem?.id === item.id;
                      return (
                        <div key={item.id} style={{ position: "relative" }}>
                          <button className={`historyItem ${isSelected ? "historyItemActive" : ""}`} style={{ paddingRight: 48 }} onClick={() => setSelectedHistoryItem(isSelected ? null : item)}>
                            <div className="historyTitle">{item.lecture_title || "제목 없음"}</div>
                            <div className="historyMeta" style={{ display: "flex", justifyContent: "space-between" }}>
                              <span>{item.created_at ? new Date(item.created_at).toLocaleString("ko-KR") : "날짜 없음"}</span>
                              <span style={{ fontWeight: 700, color: item.score >= 80 ? "#16a34a" : item.score >= 50 ? "#f59e0b" : "#dc2626" }}>
                                {item.correct}/{item.total} ({item.score}점)
                              </span>
                            </div>
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); deleteQuizHistory(item.id); }} title="기록 삭제" style={{ position: "absolute", top: "50%", right: 12, transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#9ca3af", padding: "4px 6px", borderRadius: 8, lineHeight: 1 }}>🗑️</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="rightPanel">
              {selectedHistoryItem ? (
                <div className="card">
                  <div className="sectionHeader">
                    <h2>{selectedHistoryItem.lecture_title}</h2>
                    <span className="badge" style={{ background: selectedHistoryItem.score >= 80 ? "#f0fdf4" : selectedHistoryItem.score >= 50 ? "#fffbeb" : "#fef2f2", color: selectedHistoryItem.score >= 80 ? "#16a34a" : selectedHistoryItem.score >= 50 ? "#f59e0b" : "#dc2626", borderColor: selectedHistoryItem.score >= 80 ? "#bbf7d0" : selectedHistoryItem.score >= 50 ? "#fcd34d" : "#fecaca" }}>{selectedHistoryItem.correct}/{selectedHistoryItem.total} · {selectedHistoryItem.score}점</span>
                  </div>
                  <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>{selectedHistoryItem.created_at ? new Date(selectedHistoryItem.created_at).toLocaleString("ko-KR") : "날짜 없음"}</div>
                  <div className="quizList">
                    {(selectedHistoryItem.results || []).map((r, idx) => (
                      <div key={idx} className="quizItem" style={{ borderColor: r.isCorrect === true ? "#bbf7d0" : r.isCorrect === false ? "#fecaca" : "#e5e7eb", background: r.isCorrect === true ? "#f0fdf4" : r.isCorrect === false ? "#fef2f2" : "#fff" }}>
                        <div className="quizQuestion" style={{ marginBottom: 6 }}>{r.isCorrect === true ? "✅" : r.isCorrect === false ? "❌" : "➖"} Q{idx + 1}. {r.question}</div>
                        <div style={{ fontSize: 13, color: "#374151", marginBottom: 4 }}><strong>내 답변:</strong> {r.userAnswer || "미응답"}</div>
                        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}><strong>모범 답안:</strong> {r.answer}</div>
                        {r.feedback && <div style={{ fontSize: 13, color: "#4b5563", background: "#f8fafc", borderRadius: 8, padding: "6px 10px", border: "1px solid #e5e7eb" }}>💬 {r.feedback}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="card">
                  <div className="emptyBox" style={{ padding: 32 }}>왼쪽에서 기록을 선택하면<br />상세 결과를 확인할 수 있습니다.</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
  );
}

export default App;