import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { io } from "socket.io-client";

const API_BASE_URL =
    process.env.REACT_APP_API_URL || "http://localhost:5000";

const socket = io(API_BASE_URL, {
    autoConnect: false,
    transports: ["websocket", "polling"],
});

const inputStyle = { padding: '12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' };
const switchLinkStyle = { color: '#2383e2', cursor: 'pointer', textDecoration: 'underline', marginLeft: '4px' };


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
        files: Array.isArray(parsed.files) ? parsed.files : [],
        keywordExplanations: parsed.keywordExplanations || {},
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
    const [keywordExplanations, setKeywordExplanations] = useState({});
    const [lectureFiles, setLectureFiles] = useState([]);
    const [showReviewContent, setShowReviewContent] = useState(true);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [authMode, setAuthMode] = useState("login");
    const [authForm, setAuthForm] = useState({
        name: "",
        email: "",
        password: "",
    });
    const [authMessage, setAuthMessage] = useState("");
    const [showResendButton, setShowResendButton] = useState(false);

    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [user, setUser] = useState(null);
    const [showProfileMenu, setShowProfileMenu] = useState(false);

    const [activeTab, setActiveTab] = useState("home");
    const [notifications, setNotifications] = useState([]);
    const [showNotiMenu, setShowNotiMenu] = useState(false);

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

    // 퀴즈 생성 옵션
    const [quizCount, setQuizCount] = useState(3);
    const [quizDifficulty, setQuizDifficulty] = useState("보통");
    const [quizTypes, setQuizTypes] = useState(["short"]);
    const [showQuizOptions, setShowQuizOptions] = useState(false);

    // 퀴즈 히스토리
    const [quizHistory, setQuizHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);

    const [sourceLang, setSourceLang] = useState("한국어");
    const [isRecording, setIsRecording] = useState(false);
    const [currentImgIndex, setCurrentImgIndex] = useState(0);
    // 슬라이드 쇼를 위한 이미지 리스트 (여기에 이미지 URL들을 넣으세요)
    const landingImages = [
        "/images/image1.png",
        "/images/image2.png",
        "/images/image3.png"
    ];

    // 3초마다 이미지가 자동으로 넘어가게 하는 타이머
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentImgIndex((prev) => (prev + 1) % landingImages.length);
        }, 3000); // 3000ms = 3초
        return () => clearInterval(timer);
    }, [landingImages.length]);
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
    const chatEndRef = useRef(null);

    const [messages, setMessages] = useState(() => {
        try {
            const stored = localStorage.getItem("chatMessages");
            return stored ? JSON.parse(stored) : { "team-room": [] };
        } catch {
            return { "team-room": [] };
        }
    });



    //공통 인증 헬퍼
    function getAuthHeaders(extra = {}) {
        const token = localStorage.getItem("token");

        if (!token) {
            return { ...extra };
        }

        return {
            ...extra,
            Authorization: `Bearer ${token}`,
        };
    }

    function getKeywordExplanation(keyword) {
        const clean = String(keyword || "").replace(/^#/, "").trim();

        return (
            keywordExplanations?.[keyword] ||
            keywordExplanations?.[clean] ||
            Object.entries(keywordExplanations || {}).find(([key]) =>
                clean.includes(key) || key.includes(clean)
            )?.[1] ||
            "설명 없음"
        );
    }

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
            const res = await fetch(`${API_BASE_URL}/api/friends/${user.user_id}`, {
                headers: getAuthHeaders(),
            });
            const data = await res.json();
            if (res.ok) setFriends(data);
        } catch (err) {
            console.error("친구 목록 로드 실패:", err);
        }
    };

    const fetchFriendRequests = async () => {
        if (!user?.user_id) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/friends/requests/${user.user_id}`, {
                headers: getAuthHeaders(),
            });
            const data = await res.json();
            if (res.ok) setFriendRequests(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("받은 친구 요청 로드 실패:", err);
        }
    };

    const fetchSentFriendRequests = async () => {
        if (!user?.user_id) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/friends/requests/sent/${user.user_id}`, {
                headers: getAuthHeaders(),
            });
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
                headers: getAuthHeaders({
                    "Content-Type": "application/json",
                }),
                body: JSON.stringify({
                    friendEmail: email,
                    senderName: user.name,
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
                headers: getAuthHeaders({
                    "Content-Type": "application/json",
                }),
                body: JSON.stringify({
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
            const res = await fetch(`${API_BASE_URL}/api/chat/rooms/${user.user_id}`, {
                headers: getAuthHeaders(),
            });
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
            fetch(`${API_BASE_URL}/api/chat/messages/${currentRoomId}`, {
                headers: getAuthHeaders(),
            })
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

    socket.auth = { token: localStorage.getItem("token") };
    if (!socket.connected) socket.connect();

    socket.emit("join_self");
    if (currentRoomId) socket.emit("join_room", currentRoomId);

    // [중요] 메시지 오면 알림 배열에 추가하는 로직
    const handleMessage = (data) => {
        const roomKey = data.roomId ?? data.room_id;
        setMessages((prev) => {
            const prevMsgs = prev[roomKey] || [];
            if (prevMsgs.some(m => (m.id && m.id === data.id) || (m.client_temp_id && m.client_temp_id === data.client_temp_id))) {
                return prev;
            }
            return {
                ...prev,
                [roomKey]: [...prevMsgs, data],
            };
        });

        if (String(roomKey) !== String(currentRoomId)) {
            setNotifications(prev => [{
                id: Date.now(),
                message: `${data.sender_name}님: ${data.text ?? data.message}`,
                link: 'chat'
            }, ...prev]);
        }
    };

    const handleNotification = (data) => {
        setNotifications(prev => [{
            id: Date.now(),
            message: data.message,
            link: data.type === 'friend_request' ? 'chat' : 'home'
        }, ...prev]);

        if (['friend_request', 'friend_accepted', 'friend_rejected'].includes(data?.type)) {
            fetchFriendRequests();
            fetchSentFriendRequests();
            fetchFriends();
        }
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

    useEffect(() => {
    if (chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
    }, [messages, currentRoomId]);

    async function fetchLectures() {
        if (!user?.user_id) return;

        setLoadingLectures(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/lectures/${user.user_id}`, {
                headers: getAuthHeaders(),
            });
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
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(authForm),
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.message || "회원가입 실패");

            // 수정된 안내 메시지
            setAuthMessage("📩 인증 메일이 발송되었습니다! 입력하신 메일함에서 '인증하기' 버튼을 눌러야 로그인이 가능합니다.");

            // 입력 폼 초기화 및 로그인 모드로 전환 [cite: 95-96]
            setAuthMode("login");
            setAuthForm({ name: "", email: authForm.email, password: "" });
            setShowResendButton(false);
        } catch (error) {
            setAuthMessage(error.message || "회원가입 중 오류가 발생했습니다.");
        }
    }

    async function handleLogin(e) {
        e.preventDefault();
        setAuthMessage(""); // 시도할 때마다 이전 메시지 초기화

        try {
            const res = await fetch(`${API_BASE_URL}/api/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: authForm.email,
                    password: authForm.password,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                // 서버에서 403 에러와 함께 보낸 "이메일 인증 필요" 메시지를 에러로 던집니다.
                throw new Error(data.message || "로그인 실패");
            }

            // 로그인 성공 시 로직
            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));
            socket.auth = { token: data.token };
            socket.connect();
            setUser(data.user);
            setIsLoggedIn(true);
            setActiveTab("home");
        } catch (error) {
            setAuthMessage(error.message);

            if (error.message && error.message.includes("이메일 인증")) {
                setShowResendButton(true);
            }
        }
    }
    async function handleResendVerification() {
        if (!authForm.email) return alert("이메일을 입력해주세요.");
        try {
            const res = await fetch(`${API_BASE_URL}/api/resend-verification`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: authForm.email }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "재발송 실패");
            setAuthMessage("📩 인증 메일이 재발송되었습니다! 메일함을 확인해주세요.");
            setShowResendButton(false);
        } catch (error) {
            setAuthMessage(error.message || "재발송 중 오류가 발생했습니다.");
        }
    }


    function handleLogout() {
        socket.disconnect()
        localStorage.removeItem("token");
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
            const apiEndpoint =
                sourceLang !== "한국어"
                    ? "/api/translate-summarize"
                    : "/api/summarize";

            const res = await fetch(`${API_BASE_URL}${apiEndpoint}`, {
                method: "POST",
                headers: getAuthHeaders({
                    "Content-Type": "application/json",
                }),
                body: JSON.stringify({
                    text: lectureText,
                    sourceLang,
                }),
            });

            const data = await res.json();

            console.log("AI 응답:", data);

            if (!res.ok) {
                throw new Error(data.message || "요약 생성 실패");
            }

            setSummary(data.summary || "");
            setKeywords(Array.isArray(data.keywords) ? data.keywords : []);
            setKeywordExplanations(data.keywordExplanations || {});
            setQuiz(Array.isArray(data.quiz) ? data.quiz : []);

            setLectureMessage("AI 요약 생성 완료 ✅");
        } catch (error) {
            setLectureMessage(error.message || "요약 생성 중 오류 발생");
        } finally {
            setIsSummarizing(false);
        }
    }


    async function handleSaveLecture() {
        if (!lectureTitle || !lectureText) {
            alert("제목과 내용을 입력하세요.");
            return;
        }

        try {
            const formData = new FormData();

            formData.append("title", lectureTitle);
            formData.append("raw_text", lectureText);

            formData.append(
                "summary_data",
                JSON.stringify({
                    summary,
                    keywords,
                    keywordExplanations,
                    quiz,
                })
            );

            lectureFiles.forEach((file) => {
                formData.append("files", file);
            });

            const res = await fetch(`${API_BASE_URL}/api/lectures`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: formData,
            });

            const data = await res.json();


            if (!res.ok) {
                throw new Error(data.message || "저장 실패");
            }

            alert("강의 저장 완료!");

            await fetchLectures();

            setLectureTitle("");
            setLectureText("");
            setSummary("");
            setKeywords([]);
            setQuiz([]);
            setLectureFiles([]);

        } catch (err) {
            console.error(err);
            alert("저장 중 오류 발생");
        }
    }

    function handleSelectLecture(lecture) {

        if (selectedLecture?.id === lecture.id) {
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
            setIsEditMode(false);
            setLectureMessage("");
            return;
        }


        setSelectedLecture(lecture);
        setLectureTitle(lecture.title || "");
        setLectureText(lecture.raw_text || "");
        setSummary(lecture.summary || "");
        setKeywords(Array.isArray(lecture.keywords) ? lecture.keywords : []);
        setQuiz([]); 
        setKeywordExplanations(lecture.keywordExplanations || {});
        setAnswers({});
        setSubmitted({});
        setGradeResults({});
        setGrading({});
        setIsEditMode(false);
        setLectureMessage("저장된 강의를 불러왔습니다.");
    }

    async function handleDeleteLecture(e, lectureId) {
        e.stopPropagation();
        if (!window.confirm("이 강의를 삭제하시겠습니까?")) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/lectures/${lectureId}`, {
                method: "DELETE",
                headers: getAuthHeaders(),
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
        if (!selectedLecture?.id) return;

        setIsSaving(true);

        try {
            const formData = new FormData();

            formData.append("title", lectureTitle);
            formData.append("raw_text", lectureText);

            formData.append(
                "summary_data",
                JSON.stringify({
                    summary,
                    keywords,
                    keywordExplanations,
                    quiz,
                })
            );

            // ⭐ 새 파일 추가
            lectureFiles.forEach((file) => {
                formData.append("files", file);
            });

            const res = await fetch(`${API_BASE_URL}/api/lectures/${selectedLecture.id}`, {
                method: "PUT",
                headers: getAuthHeaders(), 
                body: formData,
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            alert("수정 완료!");

            await fetchLectures();
        } catch (err) {
            alert("수정 실패");
        } finally {
            setIsSaving(false);
        }
    }

    async function fetchQuizHistory() {
        if (!user?.user_id) return;
        setLoadingHistory(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/quiz-history/${user.user_id}`, {
                headers: getAuthHeaders(),
            })
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
                headers: getAuthHeaders(),
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

            const res = await fetch(`${API_BASE_URL}/api/transcribe`, {
                method: "POST",
                headers: getAuthHeaders(),
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

            if (!cleaned) return;

            const prevTail = liveTranscriptRef.current.slice(-80);
            if (prevTail.includes(cleaned)) return;

            liveTranscriptRef.current = `${liveTranscriptRef.current} ${cleaned}`.trim();
            setLiveTranscript(liveTranscriptRef.current);
            setLectureMessage("실시간 변환 중... 🎤");
        } catch (err) {
            console.error("실시간 세그먼트 업로드 실패:", err);
            setLectureMessage(err.message || "실시간 변환 중 일부 구간 실패");
        } finally {
            setIsLiveUploading(false);
            setIsTranscribing(false);
        }
    };

    async function startRecording() {
        const token = localStorage.getItem("token");
        if (!token) {
            alert("로그인이 필요합니다.");
            return;
        }
        // 1. 기존 녹음 내용이 있는지 확인하고 이어서 할지 물어보기
        let shouldAppend = false;
        if (liveTranscriptRef.current.trim().length > 0) {
            shouldAppend = window.confirm(
                "기존에 녹음하던 내용이 있습니다.\n이어서 녹음하시겠습니까?\n\n[확인]: 기존 내용 뒤에 이어붙임\n[취소]: 새로 시작 (기존 내용 삭제)"
            );
        }

        // 2. 녹음 방식 선택 (기존 로직)
        const choice = window.confirm(
            "녹음 장치를 선택해주세요.\n\n" +
            "[확인]: 유튜브/인강 화면 공유 녹음\n" +
            "[취소]: 목소리/스피커 소리 녹음"
        );

        try {
            let stream;
            if (choice) {
                stream = await navigator.mediaDevices.getDisplayMedia({
                    video: { displaySurface: "browser" },
                    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
                });
                const audioTrack = stream.getAudioTracks()[0];
                if (!audioTrack) {
                    alert("⚠️ '시스템 오디오 공유'를 체크해야 소리가 녹음됩니다!");
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }
                setLectureMessage("시스템 오디오 녹음 중... 🎙️");
            } else {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: { channelCount: 1, noiseSuppression: true, echoCancellation: true, autoGainControl: true }
                });
                setLectureMessage("마이크 녹음 중... 🎙️");
            }

            // 3. 데이터 초기화 설정
            if (!shouldAppend) {
                // 새로 시작할 때만 싹 비움
                setLectureText("");
                setLiveTranscript("");
                liveTranscriptRef.current = "";
            } else {
                // 이어하기 할 때는 기존 메시지에 안내만 추가
                setLectureMessage(prev => prev + " (이어서 녹음 중...)");
            }

            recordingStreamRef.current = stream;
            isRecordingRef.current = true;
            setIsRecording(true);

            const mimeType = getSupportedMimeType();
            const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";

            const recordOneChunk = () => {
                if (!isRecordingRef.current || !recordingStreamRef.current) return;
                const audioStream = new MediaStream(recordingStreamRef.current.getAudioTracks());
                const recorder = new MediaRecorder(audioStream, { mimeType });
                mediaRecorderRef.current = recorder;
                const chunkParts = [];

                recorder.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) chunkParts.push(e.data);
                };

                recorder.onstop = async () => {
                    if (chunkParts.length > 0) {
                        const completeBlob = new Blob(chunkParts, { type: mimeType });
                        await uploadSegment(completeBlob, `segment_${Date.now()}.${ext}`);
                    }
                    if (isRecordingRef.current) recordOneChunk();
                };

                recorder.start();
                setTimeout(() => {
                    if (recorder.state !== "inactive") recorder.stop();
                }, 6000);
            };

            recordOneChunk();
        } catch (err) {
            console.error("녹음 시작 오류:", err);
            setLectureMessage(`녹음 취소 또는 오류: ${err.message}`);
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

        const activeQuiz = quiz;

        try {
            const res = await fetch(`${API_BASE_URL}/api/grade`, {
                method: "POST",
                headers: getAuthHeaders({
                    "Content-Type": "application/json",
                }),
                body: JSON.stringify({
                    question,
                    correctAnswer,
                    userAnswer,
                }),
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
                        headers: getAuthHeaders({
                            "Content-Type": "application/json",
                        }),
                        body: JSON.stringify({
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
            text,
            client_temp_id,
        });

        setChatInput("");
    }

    async function handleGenerateQuiz() {
        const text = selectedLecture?.raw_text || lectureText;
        if (!text?.trim()) {
            alert("강의 내용이 없습니다. 강의를 먼저 선택하거나 입력해주세요.");
            return;
        }
        setIsSummarizing(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/generate-quiz`, {
                method: "POST",
                headers: getAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ text, quizCount, quizDifficulty, quizTypes }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "퀴즈 생성 실패");
            setQuiz(Array.isArray(data.quiz) ? data.quiz : []);
            setAnswers({});
            setSubmitted({});
            setGradeResults({});
            setGrading({});
            quizHistorySavedRef.current = false;
        } catch (err) {
            alert(err.message || "퀴즈 생성 중 오류가 발생했습니다.");
        } finally {
            setIsSummarizing(false);
        }
    }







    const displayKeywords = selectedLecture ? selectedLecture.keywords || [] : keywords;
    // 복습퀴즈 탭: 퀴즈 생성 버튼을 눌러야 만들어짐 (강의 선택 시 자동 표시 안 함)
    const displayQuiz = quiz;

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
            <div className="notion-style-landing" style={{
                backgroundColor: '#fff', color: '#37352f', fontFamily: 'Inter, apple-system, sans-serif', overflowX: 'hidden'
            }}>
                {/* 1. 상단 네비게이션 바 (노션 스타일) */}
                <nav style={{
                    position: 'sticky', top: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '16px 40px', background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(10px)', zIndex: 1000, borderBottom: '1px solid #efefef'
                }}>
                    <div style={{ fontWeight: 700, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>📓</span> Lecture AI
                    </div>
                    <button
                        onClick={() => document.getElementById('auth-section').scrollIntoView({ behavior: 'smooth' })}
                        style={{ padding: '8px 16px', background: '#37352f', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                    >
                        무료로 시작하기
                    </button>
                </nav>

                {/* 2. 메인 히어로 섹션 (애니메이션 느낌) */}
                <section style={{
                    textAlign: 'center', padding: '100px 20px', background: 'radial-gradient(circle at top, #f7f6f3 0%, #fff 100%)'
                }}>
                    <h1 style={{ fontSize: '64px', fontWeight: 800, marginBottom: '24px', letterSpacing: '-0.02em' }}>
                        잠들지 않는 <span style={{ color: '#2383e2' }}>AI 학습 팀</span>
                    </h1>
                    <p style={{ fontSize: '20px', color: '#6b6b6b', maxWidth: '700px', margin: '0 auto 40px', lineHeight: 1.6 }}>
                        Lecture AI는 24시간 당신의 곁에서 강의를 전사하고, 핵심을 요약하며,<br />
                        맞춤형 퀴즈를 통해 완벽한 복습을 지원합니다.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                        <button
                            onClick={() => document.getElementById('auth-section').scrollIntoView({ behavior: 'smooth' })}
                            style={{ padding: '14px 28px', background: '#2383e2', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '18px', fontWeight: 600, cursor: 'pointer' }}
                        >
                            지금 시작하기 — 무료입니다
                        </button>
                    </div>

                    {/* 장식용 대시보드 이미지 느낌의 박스 */}
                    <div style={{
                        marginTop: '60px', maxWidth: '900px', margin: '60px auto 0', padding: '20px', background: '#f1f1ef', borderRadius: '12px',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.1)'
                    }}>
                        <div style={{
                            width: '100%',
                            height: '450px',
                            background: '#fff',
                            borderRadius: '12px',
                            overflow: 'hidden',
                            position: 'relative',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.08)'
                        }}>
                            {landingImages.map((img, idx) => (
                                <img
                                    key={idx}
                                    src={img}
                                    alt={`Slide ${idx}`}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'contain',
                                        transition: 'opacity 1s ease-in-out',
                                        opacity: currentImgIndex === idx ? 1 : 0,
                                        zIndex: currentImgIndex === idx ? 1 : 0
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </section>

                {/* 3. 특장점 섹션 (스크롤 효과 유도) */}
                <section style={{ padding: '100px 40px', maxWidth: '1100px', margin: '0 auto' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '60px', alignItems: 'center', marginBottom: '100px' }}>
                        <div>
                            <span style={{ color: '#2383e2', fontWeight: 700, fontSize: '14px', textTransform: 'uppercase' }}>Feature 01</span>
                            <h2 style={{ fontSize: '36px', fontWeight: 700, marginTop: '12px', marginBottom: '20px' }}>내 인터넷 강의 소리만 쏙,<br />깨끗한 내부 오디오 녹음</h2>
                            <p style={{ color: '#6b6b6b', fontSize: '18px', lineHeight: 1.6 }}>
                                주변 소음 걱정 없이 브라우저 내부 소리만 직접 캡처하세요. Whisper AI가 단 한 문장도 놓치지 않고 텍스트로 바꿔드립니다.
                            </p>
                            <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
                                <span style={{ padding: '6px 12px', background: '#9fd0ff', color: '#3a6881', borderRadius: '20px', fontSize: '13px', fontWeight: 600 }}>#인터넷강의녹음</span>
                                <span style={{ padding: '6px 12px', background: '#9fd0ff', color: '#3a6881', borderRadius: '20px', fontSize: '13px', fontWeight: 600 }}>#실시간강의녹음</span>
                            </div>

                        </div>
                        <div style={{ background: '#f7f6f3', height: '300px', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '50px' }}>🎙️</div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '60px', alignItems: 'center' }}>
                        <div style={{ background: '#f7f6f3', height: '300px', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '50px' }}>🧠</div>
                        <div>
                            <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '14px', textTransform: 'uppercase' }}>Feature 02</span>
                            <h2 style={{ fontSize: '36px', fontWeight: 700, marginTop: '12px', marginBottom: '20px' }}>GPT-4o가 생성하는<br />완벽한 강의 요약과 퀴즈</h2>
                            <p style={{ color: '#6b6b6b', fontSize: '18px', lineHeight: 1.6 }}>
                                방대한 강의 내용을 3~5문장으로 요약하고, 시험에 나올 법한 키워드와 복습 퀴즈를 자동으로 만들어줍니다.
                            </p>
                            <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
                                <span style={{ padding: '6px 12px', background: '#b4ffca', color: '#7ba172', borderRadius: '20px', fontSize: '13px', fontWeight: 600 }}>#완벽요약</span>
                                <span style={{ padding: '6px 12px', background: '#b4ffca', color: '#7ba172', borderRadius: '20px', fontSize: '13px', fontWeight: 600 }}>#퍼펙트퀴즈</span>
                            </div>

                        </div>
                    </div>
                </section>

                {/* Feature 03: Feature 01, 02와 완벽하게 동일한 규격 */}
                <section style={{ padding: '0 40px 100px', maxWidth: '1100px', margin: '0 auto' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '60px', alignItems: 'center' }}>

                        {/* 왼쪽: 설명글 (Feature 01과 동일한 구조) */}
                        <div>
                            <span style={{ color: '#9333ea', fontWeight: 700, fontSize: '14px', textTransform: 'uppercase' }}>Feature 03</span>
                            <h2 style={{ fontSize: '36px', fontWeight: 700, marginTop: '12px', marginBottom: '20px' }}>팀원들과 실시간으로<br />질문하고 토론하세요</h2>
                            <p style={{ color: '#6b6b6b', fontSize: '18px', lineHeight: 1.6 }}>
                                강의 중 궁금한 점은 즉시 팀 채팅방에 공유하세요.<br />
                                끊김 없는 실시간 소통으로 학습 효율이 극대화됩니다.
                            </p>
                            <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
                                <span style={{ padding: '6px 12px', background: '#f3e8ff', color: '#9333ea', borderRadius: '20px', fontSize: '13px', fontWeight: 600 }}>#실시간소통</span>
                                <span style={{ padding: '6px 12px', background: '#f3e8ff', color: '#9333ea', borderRadius: '20px', fontSize: '13px', fontWeight: 600 }}>#팀프로젝트</span>
                            </div>
                        </div>

                        {/* 오른쪽: 채팅 비주얼 박스 (Feature 01의 회색 박스와 크기/위치 완벽 일치) */}
                        <div style={{
                            background: '#f7f6f3',
                            height: '300px',
                            borderRadius: '24px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            padding: '40px',
                            boxSizing: 'border-box'
                        }}>
                            <div style={{ alignSelf: 'flex-start', background: '#fff', padding: '10px 16px', borderRadius: '12px 12px 12px 0', fontSize: '14px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', maxWidth: '85%', marginBottom: '10px' }}>
                                오늘 강의 알고리즘 이해돼? 🤔
                            </div>
                            <div style={{ alignSelf: 'flex-end', background: '#0443f0', color: '#fff', padding: '10px 16px', borderRadius: '12px 12px 0 12px', fontSize: '14px', maxWidth: '85%', marginBottom: '10px' }}>
                                응! AI 요약본 보니까 쉽더라 👍
                            </div>
                            <div style={{ alignSelf: 'flex-start', background: '#fff', padding: '10px 16px', borderRadius: '12px 12px 12px 0', fontSize: '14px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', maxWidth: '85%' }}>
                                나도 퀴즈 풀면서 복습해야지!
                            </div>
                        </div>
                    </div>
                </section>

                {/* 4. 실제 로그인/회원가입 섹션 (하단에 배치) */}
                <section id="auth-section" style={{ padding: '100px 20px', background: '#f7f6f3' }}>
                    <div style={{
                        maxWidth: '400px', margin: '0 auto', background: '#fff', padding: '40px', borderRadius: '16px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
                    }}>
                        <h2 style={{ fontSize: '24px', fontWeight: 700, textAlign: 'center', marginBottom: '32px' }}>
                            {authMode === "login" ? "로그인하고 공부 시작" : "새 계정 만들기"}
                        </h2>
                        {authMessage && (
                            <div style={{
                                marginBottom: '20px',
                                padding: '12px',
                                borderRadius: '8px',
                                backgroundColor: '#fef2f2', // 빨간 배경
                                color: '#dc2626',           // 빨간 글씨
                                fontSize: '14px',
                                textAlign: 'center',
                                fontWeight: '700',
                                border: '1px solid #fecaca'
                            }}>
                                {authMessage}
                            </div>
                        )}
                        {showResendButton && authMode === "login" && (
                            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                                <button
                                    type="button"
                                    onClick={handleResendVerification}
                                    style={{
                                        padding: '10px 20px',
                                        background: '#2383e2',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '8px',
                                        fontWeight: 600,
                                        fontSize: '14px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    📩 인증 메일 재발송
                                </button>
                            </div>
                        )}
                        <form onSubmit={authMode === "login" ? handleLogin : handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {authMode === "signup" && (
                                <input style={inputStyle} name="name" placeholder="이름" value={authForm.name} onChange={handleAuthInputChange} required />
                            )}
                            <input style={inputStyle} type="email" name="email" placeholder="이메일" value={authForm.email} onChange={handleAuthInputChange} required />
                            <input style={inputStyle} type="password" name="password" placeholder="비밀번호" value={authForm.password} onChange={handleAuthInputChange} required />
                            <button type="submit" style={{
                                padding: '12px', background: '#37352f', color: '#fff', border: 'none', borderRadius: '6px',
                                fontWeight: 600, fontSize: '16px', marginTop: '12px', cursor: 'pointer'
                            }}>
                                {authMode === "login" ? "로그인" : "회원가입"}
                            </button>
                        </form>
                        <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '14px', color: '#6b6b6b' }}>
                            {authMode === "login" ? (
                                <>계정이 없으신가요? <span onClick={() => setAuthMode("signup")} style={switchLinkStyle}>회원가입</span></>
                            ) : (
                                <>이미 계정이 있으신가요? <span onClick={() => setAuthMode("login")} style={switchLinkStyle}>로그인으로 돌아가기</span></>
                            )}
                        </div>
                    </div>
                </section>

                {/* 5. 푸터 */}
                <footer style={{ padding: '60px 40px', textAlign: 'center', color: '#999', fontSize: '13px', borderTop: '1px solid #efefef' }}>
                    © 2026 Lecture AI. 캡스톤 디자인 9조 프로젝트
                </footer>
            </div>
        );
    }


    return (
        <div className={isDarkMode ? "app dark" : "app"}>

            <div className="dashboardLayout">

  {/* 사이드바 */}
  <aside className="dashboardSidebar">
    <div className="sidebarLogo">📖</div>

    <button
        className={activeTab === "home" ? "sidebarMenu active" : "sidebarMenu"}
        onClick={() => setActiveTab("home")}
    >
        🏠 홈
    </button>

    <button
        className={activeTab === "lecture" ? "sidebarMenu active" : "sidebarMenu"}
        onClick={() => {
            setSelectedLecture(null);
            setLectureTitle("");
            setLectureText("");
            setSummary("");
            setKeywords([]);
            setQuiz([]);
            setLectureFiles([]);
            setIsEditMode(false);
            setLectureMessage("");
            setActiveTab("lecture");
        }}
    >
        📘 강의
    </button>

    <button
        className={activeTab === "savedLectures" ? "sidebarMenu active" : "sidebarMenu"}
        onClick={() => setActiveTab("savedLectures")}
    >
        🔖 저장된 강의
    </button>

    <button
        className={activeTab === "chat" ? "sidebarMenu active" : "sidebarMenu"}
        onClick={() => {
            setActiveTab("chat");
            resetChatSelection();
        }}
    >
        👥 팀 채팅
    </button>

    <button
        className={activeTab === "reviewQuiz" ? "sidebarMenu active" : "sidebarMenu"}
        onClick={() => setActiveTab("reviewQuiz")}
    >
        ✏️ 복습 퀴즈
    </button>

    <button
        className={activeTab === "quizhistory" ? "sidebarMenu active" : "sidebarMenu"}
        onClick={() => setActiveTab("quizhistory")}
    >
        🧾 퀴즈 히스토리
    </button>

    <button
        className={activeTab === "exam" ? "sidebarMenu active" : "sidebarMenu"}
        onClick={() => setActiveTab("exam")}
    >
        📊 시험 중요도
    </button>

    <button
        className={activeTab === "analytics" ? "sidebarMenu active" : "sidebarMenu"}
        onClick={() => setActiveTab("analytics")}
    >
        🎯 집중도 분석
    </button>
</aside>


  {/* 메인 */}
  <main className="dashboardMain">

    <div className="dashboardHeaderIcons">
    {/* 알림 버튼 영역 시작 */}
    <div className="profileMenuWrap">
        <button className="iconBtn" onClick={() => setShowNotiMenu(!showNotiMenu)}>
            🔔
            {/* 알림이 있을 때만 숫자가 뜹니다 */}
            {notifications.length > 0 && (
                <span className="notificationBadge">{notifications.length}</span>
            )}
        </button>

        {/* 알림 버튼 눌렀을 때 열리는 창 */}
        {showNotiMenu && (
            <div className="profileDropdown notificationDropdown">
                <div className="profileDropdownUser">
                    <strong>🔔 실시간 알림</strong>
                </div>
                <div className="notificationList">
                    {notifications.length === 0 ? (
                        <div className="profileDropdownItem" style={{color: '#94a3b8', fontSize: '13px'}}>새 알림이 없습니다.</div>
                    ) : (
                        notifications.map(noti => (
                            <button 
                                key={noti.id} 
                                className="profileDropdownItem"
                                onClick={() => {
                                    setActiveTab(noti.link);
                                    setShowNotiMenu(false);
                                }}
                            >
                                {noti.message}
                            </button>
                        ))
                    )}
                </div>
                {notifications.length > 0 && (
                    <button className="profileDropdownItem danger" onClick={() => setNotifications([])} style={{textAlign: 'center', borderTop: '1px solid #eee', marginTop: '8px'}}>
                        모두 지우기
                    </button>
                )}
            </div>
        )}
    </div>

    <div className="profileMenuWrap">
    <button
        className="profileBtn"
        onClick={() => setShowProfileMenu((prev) => !prev)}
    >
        {user?.name ? user.name.charAt(0) : "U"}
    </button>

    {showProfileMenu && (
        <div className="profileDropdown">
            <div className="profileDropdownUser">
                <strong>{user?.name || "사용자"}</strong>
                <span>{user?.email}</span>
            </div>

            <button
                className="profileDropdownItem"
                onClick={() => setIsDarkMode((prev) => !prev)}
            >
                🌙 다크모드
            </button>

            <button
                className="profileDropdownItem danger"
                onClick={handleLogout}
            >
                로그아웃
            </button>
        </div>
    )}
</div>
</div>


{activeTab === "home" && (
    <>
    {/* 상단 */}
    <div className="dashboardTopbar">
      <div>
        <h1 className="dashboardTitle">TODAY'S LEARNING</h1>
        <p className="dashboardSub">
          오늘 학습 현황을 한눈에 확인하세요
        </p>
      </div>

      <button className="createBtn">
        + 새 강의 생성
      </button>
    </div>


    {/* 카드 영역 */}
    <div className="dashboardGrid">

      {/* 현재 강의 */}
      <div className="dashboardCard largeCard">
        <div className="cardHeaderRow">
          <h3>CURRENT LECTURE</h3>
          <span className="newBadge">NEW</span>
        </div>

        <p className="cardDescription">
          오늘 학습 진행률입니다.
        </p>

        <div className="progressGroup">
          <div className="progressTop">
            <span>Lecture</span>
            <span>10 / 10</span>
          </div>
          <div className="progressBar">
            <div className="progressFillBlue" style={{ width: "100%" }} />
          </div>
        </div>

        <div className="progressGroup">
          <div className="progressTop">
            <span>Quiz</span>
            <span>80%</span>
          </div>
          <div className="progressBar">
            <div className="progressFillBlue" style={{ width: "80%" }} />
          </div>
        </div>
      </div>


      {/* 분석 카드 */}
      <div className="dashboardCard">
        <div className="cardHeaderRow">
          <h3>ANALYTICS</h3>
          <span className="newBadge">NEW</span>
        </div>

        <div className="analyticsPreview">
          <div className="miniChart" />
          <div className="miniChart" />
          <div className="miniChart" />
          <div className="miniChart" />
        </div>
      </div>


      {/* 통계 */}
      <div className="dashboardCard">
        <h3>SUMMARY</h3>

        <div className="summaryRow">
          <span>퀴즈 수</span>
          <strong>7</strong>
        </div>

        <div className="summaryRow">
          <span>저장된 강의</span>
          <strong>{savedLectures.length}</strong>
        </div>

        <div className="summaryRow">
          <span>집중 키워드</span>
          <strong>{keywords.length}</strong>
        </div>
      </div>


      {/* 빠른 메뉴 */}
      <div className="dashboardCard">
        <div className="cardHeaderRow">
          <h3>QUICK ACCESS</h3>
          <span className="newBadge">NEW</span>
        </div>

        <div className="quickMenuGrid">
          <button className="quickMenuBtn">
            ✏️
            <span>퀴즈</span>
          </button>

          <button className="quickMenuBtn">
            📂
            <span>강의</span>
          </button>

          <button className="quickMenuBtn">
            📊
            <span>분석</span>
          </button>
        </div>
      </div>

    </div>
    </>
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
                                    <select
                                        value={sourceLang}
                                        onChange={(e) => setSourceLang(e.target.value)}
                                        style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' }}
                                    >
                                        {["한국어", "영어", "일본어", "중국어", "스페인어", "프랑스어"].map(lang => (
                                            <option key={lang} value={lang}>{lang}</option>
                                        ))}
                                    </select>
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

                                <input
                                    type="file"
                                    multiple
                                    accept="image/*,.pdf,.ppt,.pptx"
                                    onChange={(e) => setLectureFiles(Array.from(e.target.files))}
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
                                        <span
                                            className="keywordChip"
                                            key={`${keyword}-${idx}`}
                                            title={getKeywordExplanation(keyword)}
                                            style={{
                                                borderBottom:
                                                    getKeywordExplanation(keyword) !== "설명 없음"
                                                        ? "2px solid #3b82f6"
                                                        : "2px dashed #ccc",
                                                cursor: "help"
                                            }}
                                        >
                                            #{keyword}
                                        </span>
                                    ))
                                ) : (
                                    <div className="emptyBox">키워드가 없습니다.</div>
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            )}


            {activeTab === "savedLectures" && (
                <div
                    className="gridLayout savedLecturesGridLayout"
                >
                    {/* 왼쪽: 검색 + 강의 목록 */}
                    <div className="leftPanel">
                        <div className="card">
                            <div className="sectionHeader">
                                <h2>저장된 강의</h2>
                                <span className="badge">
                                    {loadingLectures
                                        ? "불러오는 중"
                                        : `${filteredLectures.length} / ${savedLectures.length}개`}
                                </span>
                            </div>

                            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                                <input
                                    className="input"
                                    placeholder="🔍 제목 또는 키워드 검색"
                                    value={lectureSearch}
                                    onChange={(e) => setLectureSearch(e.target.value)}
                                />

                                <select
                                    className="input"
                                    value={lectureSortOrder}
                                    onChange={(e) => setLectureSortOrder(e.target.value)}
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
                                    filteredLectures.map((lecture) => {
                                        const isSelected = selectedLecture?.id === lecture.id;

                                        return (
                                            <div key={lecture.id} style={{ position: "relative" }}>
                                                <button
                                                    className={`historyItem ${isSelected ? "historyItemActive" : ""}`}
                                                    onClick={() => handleSelectLecture(lecture)}
                                                    style={{ paddingRight: 48 }}
                                                >
                                                    <div className="historyTitle">
                                                        {lecture.title || "제목 없음"}
                                                    </div>
                                                    <div className="historyMeta">
                                                        {lecture.created_at
                                                            ? new Date(lecture.created_at).toLocaleDateString("ko-KR")
                                                            : "날짜 없음"}
                                                    </div>
                                                </button>

                                                <button
                                                    className="deleteLectureBtn"
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
                                                    }}
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 오른쪽: 선택한 강의 상세 */}
                    <div className="rightPanel">
                        {selectedLecture ? (
                            <div className="card">
                                <div className="sectionHeader">
                                    <h2>{selectedLecture.title || "제목 없음"}</h2>

                                    <button
                                        className="primaryBtn"
                                        onClick={() => {
                                            setLectureTitle(selectedLecture.title || "");
                                            setLectureText(selectedLecture.raw_text || "");
                                            setSummary(selectedLecture.summary || "");
                                            setKeywords(Array.isArray(selectedLecture.keywords) ? selectedLecture.keywords : []);
                                            setQuiz(Array.isArray(selectedLecture.quiz) ? selectedLecture.quiz : []);
                                            setLectureFiles([]);

                                            setActiveTab("lecture");
                                            setIsEditMode(true);
                                        }}
                                    >
                                        ✏️ 수정하기
                                    </button>
                                </div>

                                <h3>강의 내용</h3>
                                <div className="summaryBox">
                                    {selectedLecture.raw_text || "저장된 강의 내용이 없습니다."}
                                </div>

                                <h3 style={{ marginTop: 18 }}>요약</h3>
                                <div className="summaryBox">
                                    {selectedLecture.summary || "요약이 없습니다."}
                                </div>

                                <h3 style={{ marginTop: 18 }}>핵심 키워드</h3>
                                <div className="keywordWrap">
                                    {Array.isArray(selectedLecture.keywords) &&
                                        selectedLecture.keywords.length > 0 ? (
                                        selectedLecture.keywords.map((keyword, idx) => (
                                            <span
                                                className={`keywordChip ${selectedLecture.keywordExplanations?.[keyword] ? "hasExplain" : ""
                                                    }`}
                                                title={selectedLecture.keywordExplanations?.[keyword] || "설명 없음"}
                                            >
                                                #{keyword}
                                            </span>
                                        ))
                                    ) : (
                                        <div className="emptyBox">키워드가 없습니다.</div>
                                    )}
                                </div>

                                <h3 style={{ marginTop: 18 }}>첨부 파일</h3>
                                <div className="keywordWrap">
                                    {Array.isArray(selectedLecture.files) &&
                                        selectedLecture.files.length > 0 ? (
                                        selectedLecture.files.map((file, idx) => (
                                            <a
                                                key={`${file.filename}-${idx}`}
                                                className="keywordChip"
                                                href={`${API_BASE_URL}${file.path}`}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                📎 {file.originalName || file.filename}
                                            </a>
                                        ))
                                    ) : (
                                        <div className="emptyBox">첨부 파일이 없습니다.</div>
                                    )}
                                </div>


                            </div>
                        ) : (
                            <div className="emptyBox">왼쪽에서 강의를 선택하세요</div>
                        )}
                    </div>
                </div>
            )}


            {activeTab === "reviewQuiz" && (
                <div className="card" style={{ maxWidth: '100%' }}>
                    {/* 헤더 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>복습 퀴즈</h2>
                            {selectedLecture && (
                                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                                    {selectedLecture.title}
                                </div>
                            )}
                        </div>
                        {displayQuiz.length > 0 && (
                            <div className="reviewProgressBadge" style={{ fontSize: 13, padding: '6px 14px', borderRadius: 20, fontWeight: 600 }}>
                                {Object.keys(gradeResults).length} / {displayQuiz.length} 완료
                            </div>
                        )}
                    </div>

                    {/* 진행률 바 */}
                    {displayQuiz.length > 0 && (
                        <div style={{ marginBottom: 24 }}>
                            <div className="reviewProgressTrack" style={{ height: 8, borderRadius: 99, overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%',
                                    width: `${Math.round((Object.keys(gradeResults).length / displayQuiz.length) * 100)}%`,
                                    background: 'linear-gradient(90deg, #3b82f6, #6366f1)',
                                    borderRadius: 99,
                                    transition: 'width 0.4s ease'
                                }} />
                            </div>
                        </div>
                    )}

                    {/* 퀴즈 옵션 패널 */}
                    <div className="reviewQuizSettingsPanel" style={{ border: '1px solid', borderRadius: 14, padding: '18px 20px', marginBottom: 20 }}>
                        <div className="reviewQuizSettingsTitle" style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>퀴즈 설정</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                            <div>
                                <div className="reviewQuizSettingsLabel" style={{ fontSize: 12, marginBottom: 6, fontWeight: 600 }}>문제 수</div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {[3, 5, 10].map((n) => (
                                        <button key={n} className={quizCount === n ? "optionBtnActive" : "optionBtn"} onClick={() => setQuizCount(n)}>{n}개</button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="reviewQuizSettingsLabel" style={{ fontSize: 12, marginBottom: 6, fontWeight: 600 }}>난이도</div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {["쉬움", "보통", "어려움"].map((d) => (
                                        <button key={d} className={quizDifficulty === d ? "optionBtnActive" : "optionBtn"} onClick={() => setQuizDifficulty(d)}>{d}</button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="reviewQuizSettingsLabel" style={{ fontSize: 12, marginBottom: 6, fontWeight: 600 }}>유형</div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {[{ key: "short", label: "단답형" }, { key: "mcq", label: "객관식" }, { key: "ox", label: "OX" }].map(({ key, label }) => {
                                        const isActive = quizTypes.includes(key);
                                        return (
                                            <button
                                                key={key}
                                                className={isActive ? "optionBtnActive" : "optionBtn"}
                                                onClick={() => setQuizTypes((prev) =>
                                                    isActive && prev.length === 1 ? prev : isActive ? prev.filter((t) => t !== key) : [...prev, key]
                                                )}
                                            >
                                                {label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 강의 선택 */}
                    <div className="reviewQuizLecturePanel" style={{ border: '1px solid', borderRadius: 14, padding: '16px 20px', marginBottom: 20 }}>
                        <div className="reviewQuizLectureTitle" style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>강의 선택</div>
                        {savedLectures.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {savedLectures.map((lecture) => (
                                    <button
                                        key={lecture.id}
                                        onClick={() => {
                                            if (selectedLecture?.id === lecture.id) {
                                                setSelectedLecture(null);
                                                setQuiz([]);
                                                setAnswers({});
                                                setSubmitted({});
                                                setGradeResults({});
                                                setGrading({});
                                            } else {
                                                handleSelectLecture(lecture);
                                                setShowReviewContent(false);
                                            }
                                        }}
                                        className={selectedLecture?.id === lecture.id ? "lectureSelectBtnActive" : "lectureSelectBtn"}
                                        style={{
                                            padding: '8px 16px',
                                            borderRadius: 20,
                                            fontSize: 13,
                                            fontWeight: 500,
                                            cursor: 'pointer',
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        {lecture.title}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="emptyBox">저장된 강의가 없습니다.</div>
                        )}
                    </div>

                    {/* 강의 내용 접기/펼치기 */}
                    {selectedLecture && (
                        <div style={{ marginBottom: 20 }}>
                            <button
                                className="secondaryBtn"
                                onClick={() => setShowReviewContent((prev) => !prev)}
                                style={{ fontSize: 13, padding: '8px 16px' }}
                            >
                                {showReviewContent ? "강의 내용 접기" : "강의 내용 보기"}
                            </button>
                            {showReviewContent && (
                                <div className="summaryBox" style={{ marginTop: 12 }}>
                                    {selectedLecture.raw_text || "저장된 강의 내용이 없습니다."}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 퀴즈 생성 버튼 */}
                    <div style={{ marginBottom: 24 }}>
                        <button
                            className="primaryBtn"
                            style={{ fontSize: 15, padding: "12px 28px", borderRadius: 10, fontWeight: 700 }}
                            onClick={handleGenerateQuiz}
                            disabled={isSummarizing || !selectedLecture}
                        >
                            {isSummarizing ? "퀴즈 생성 중..." : "퀴즈 생성하기"}
                        </button>
                        {!selectedLecture && (
                            <span style={{ marginLeft: 12, fontSize: 13, color: '#9ca3af' }}>강의를 먼저 선택해주세요</span>
                        )}
                        {displayQuiz.length > 0 && (
                            <button
                                className="secondaryBtn"
                                style={{ marginLeft: 10, fontSize: 13, padding: "10px 18px" }}
                                onClick={handleGenerateQuiz}
                                disabled={isSummarizing}
                            >
                                다시 생성
                            </button>
                        )}
                    </div>

                    {/* 퀴즈 목록 */}
                    {displayQuiz.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {displayQuiz.map((item, idx) => {
                                const grade = gradeResults[idx];
                                const isSubmitted = submitted[idx];
                                const isGrading = grading[idx];
                                const typeLabel = item.type === 'mcq' ? '객관식' : item.type === 'ox' ? 'OX' : '단답형';
                                const typeColor = item.type === 'mcq' ? { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' } :
                                    item.type === 'ox' ? { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' } :
                                        { bg: '#faf5ff', color: '#7c3aed', border: '#ddd6fe' };

                                return (
                                    <div
                                        key={idx}
                                        className={`reviewQuizCard${isSubmitted ? (grade?.isCorrect ? ' correct' : ' wrong') : ''}`}
                                        style={{
                                            borderRadius: 16,
                                            padding: '20px 24px',
                                            transition: 'all 0.2s',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                        }}
                                    >
                                        {/* 문제 헤더 */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                            <span style={{
                                                fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                                                background: typeColor.bg, color: typeColor.color, border: `1px solid ${typeColor.border}`
                                            }}>{typeLabel}</span>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: '#6b7280' }}>Q{idx + 1}</span>
                                            {isSubmitted && (
                                                <span style={{ marginLeft: 'auto', fontSize: 18 }}>
                                                    {grade?.isCorrect ? '✅' : '❌'}
                                                </span>
                                            )}
                                        </div>

                                        {/* 질문 */}
                                        <div className="reviewQuizQuestion" style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, lineHeight: 1.5 }}>
                                            {item.question}
                                        </div>

                                        {/* 답변 입력 영역 */}
                                        {!isEditMode && (
                                            <div>
                                                {/* 객관식 */}
                                                {item.type === "mcq" && Array.isArray(item.choices) && (
                                                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                                        {item.choices.map((choice, ci) => {
                                                            const isSelected = answers[idx] === choice;
                                                            const isCorrectChoice = choice === item.answer;
                                                            let choiceClass = "mcqChoiceBtn";
                                                            if (isSubmitted) {
                                                                if (isCorrectChoice) choiceClass = "mcqChoiceBtnCorrect";
                                                                else if (isSelected && !isCorrectChoice) choiceClass = "mcqChoiceBtnWrong";
                                                            } else if (isSelected) {
                                                                choiceClass = "mcqChoiceBtnSelected";
                                                            }
                                                            return (
                                                                <button
                                                                    key={ci}
                                                                    disabled={isSubmitted}
                                                                    onClick={() => handleAnswerChange(idx, choice)}
                                                                    className={choiceClass}
                                                                    style={{ textAlign: "left", padding: "11px 16px", borderRadius: 10, fontSize: 14, cursor: isSubmitted ? "default" : "pointer", transition: "all 0.15s", fontWeight: isSelected || (isSubmitted && isCorrectChoice) ? 600 : 400 }}
                                                                >
                                                                    {choice}
                                                                </button>
                                                            );
                                                        })}
                                                        {!isSubmitted && (
                                                            <button
                                                                className="primaryBtn"
                                                                style={{ alignSelf: "flex-start", marginTop: 6, padding: "10px 22px" }}
                                                                onClick={() => handleSubmitAnswer(idx, item.question, item.answer)}
                                                                disabled={!answers[idx]}
                                                            >
                                                                제출
                                                            </button>
                                                        )}
                                                    </div>
                                                )}

                                                {/* OX */}
                                                {item.type === "ox" && (
                                                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                                        <div style={{ display: "flex", gap: 12 }}>
                                                            {["O", "X"].map((ox) => {
                                                                const isSelected = answers[idx] === ox;
                                                                const isCorrectChoice = ox === item.answer;
                                                                let oxClass = "oxBtn";
                                                                if (isSubmitted) {
                                                                    if (isCorrectChoice) oxClass = "mcqChoiceBtnCorrect";
                                                                    else if (isSelected) oxClass = "mcqChoiceBtnWrong";
                                                                } else if (isSelected) {
                                                                    oxClass = "mcqChoiceBtnSelected";
                                                                }
                                                                return (
                                                                    <button
                                                                        key={ox}
                                                                        disabled={isSubmitted}
                                                                        onClick={() => handleAnswerChange(idx, ox)}
                                                                        className={oxClass}
                                                                        style={{ width: 80, height: 80, borderRadius: 16, fontSize: 32, fontWeight: 800, cursor: isSubmitted ? "default" : "pointer", transition: "all 0.15s", boxShadow: isSelected && !isSubmitted ? '0 0 0 3px #bfdbfe' : 'none' }}
                                                                    >
                                                                        {ox}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                        {!isSubmitted && (
                                                            <button
                                                                className="primaryBtn"
                                                                style={{ alignSelf: "flex-start", padding: "10px 22px" }}
                                                                onClick={() => handleSubmitAnswer(idx, item.question, item.answer)}
                                                                disabled={!answers[idx]}
                                                            >
                                                                제출
                                                            </button>
                                                        )}
                                                    </div>
                                                )}

                                                {/* 단답형 */}
                                                {(!item.type || item.type === "short") && (
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
                                                                style={{ whiteSpace: "nowrap", padding: "12px 20px" }}
                                                                onClick={() => handleSubmitAnswer(idx, item.question, item.answer)}
                                                                disabled={!answers[idx]?.trim()}
                                                            >
                                                                제출
                                                            </button>
                                                        )}
                                                    </div>
                                                )}

                                                {/* 채점 중 */}
                                                {isGrading && (
                                                    <div style={{ marginTop: 10, fontSize: 13, color: "#6b7280", display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #6b7280', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                                                        GPT가 채점 중...
                                                    </div>
                                                )}

                                                {/* 결과 */}
                                                {isSubmitted && !isGrading && grade && (
                                                    <div className={`gradeResultBox${grade.isCorrect ? ' correct' : ' wrong'}`} style={{ marginTop: 14, padding: '14px 16px', borderRadius: 12 }}>
                                                        <div style={{ fontSize: 14, fontWeight: 700, color: grade.isCorrect ? "#16a34a" : "#dc2626", marginBottom: 6 }}>
                                                            {grade.isCorrect ? "✅ 정답입니다!" : "❌ 오답입니다."}
                                                        </div>
                                                        <div style={{ fontSize: 13, color: "#4b5563", marginBottom: 8, lineHeight: 1.5 }}>
                                                            💬 {grade.feedback}
                                                        </div>
                                                        <div className="gradeAnswerBox" style={{ fontSize: 13, borderRadius: 8, padding: "8px 12px", fontWeight: 500 }}>
                                                            📖 모범 답안: <strong>{item.answer}</strong>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : selectedLecture ? (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
                            <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
                            <div style={{ fontSize: 15, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>퀴즈를 생성해보세요!</div>
                            <div style={{ fontSize: 13 }}>위 설정을 선택한 뒤 "퀴즈 생성하기" 버튼을 눌러주세요.</div>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
                            <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
                            <div style={{ fontSize: 15, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>강의를 선택해주세요</div>
                            <div style={{ fontSize: 13 }}>복습할 강의를 선택한 뒤 퀴즈를 생성할 수 있습니다.</div>
                        </div>
                    )}

                    {/* 점수 결과 */}
                    {displayQuiz.length > 0 && Object.keys(gradeResults).length === displayQuiz.length && (
                        <div className="finalResultBox">
                            <div className="finalResultTitle">🏆 최종 결과</div>
                            <div className="finalResultScore" style={{ color: result.score >= 80 ? '#16a34a' : result.score >= 50 ? '#d97706' : '#dc2626' }}>
                                {result.score}점
                            </div>
                            <div className="finalResultMeta">
                                {result.correct}문제 정답 / 총 {result.total}문제
                            </div>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                {Object.values(gradeResults).some((r) => !r.isCorrect) && (
                                    <button className="secondaryBtn" style={{ fontSize: 13, padding: "10px 16px" }} onClick={handleRetryWrong}>
                                        오답만 재도전
                                    </button>
                                )}
                                <button className="secondaryBtn" style={{ fontSize: 13, padding: "10px 16px" }} onClick={handleRetryAll}>
                                    전체 다시 풀기
                                </button>
                                <button className="primaryBtn" style={{ fontSize: 13, padding: "10px 16px" }} onClick={handleGenerateQuiz} disabled={isSummarizing}>
                                    새 퀴즈 생성
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 채팅 탭 컨텐츠 */}
            {activeTab === "chat" && (
                <div className="gridLayout chatGridLayout">
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
                                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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
  <div className="chatPanelHeader" style={{ padding: '16px 20px', borderBottom: '1px solid #eee' }}>
                                <h2 style={{ margin: 0, fontSize: '18px' }}>{activeChatTitle}</h2>
                            </div>

                           <div className="chatBox" style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
                                {(messages[currentRoomId] || []).length > 0 ? (
                                    (messages[currentRoomId] || []).map((msg, idx) => {
                                        const isMine = String(msg.sender_id) === String(user?.user_id);

                                        return (
                                            <div key={msg.id || msg.client_temp_id || idx} style={{ textAlign: isMine ? 'right' : 'left', marginBottom: '16px' }}>
                                               {!isMine && <div className="chatSenderName" style={{ fontSize: '12px' }}>{msg.sender_name}</div>}
                                                <div
                                                    className={isMine ? "chatBubbleMine" : "chatBubbleOther"}
                                                    style={{
                                                        display: 'inline-block',
                                                        padding: '10px 14px',
                                                        borderRadius: '12px',
                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
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
                                <div ref={chatEndRef} />
                            </div>

                            <div className="chatPanelFooter" style={{ padding: '16px', borderTop: '1px solid #eee', display: 'flex', gap: '10px' }}>
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
                <div className="gridLayout analyticsGridLayout">
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
                <div className="gridLayout quizHistoryGridLayout">
                    <div className="leftPanel">
                        <div className="card">
                            <div className="sectionHeader">
                                <h2>퀴즈 히스토리</h2>
                                <span className="badge">{loadingHistory ? "불러오는 중" : `${quizHistory.length}회`}</span>
                            </div>
                            {quizHistory.length === 0 ? (
                                <div className="emptyBox">아직 퀴즈 기록이 없습니다.<br />강의를 불러와 퀴즈를 풀면 자동으로 저장됩니다.</div>
                            ) : (
                                <div className="historyList">
                                    {quizHistory.map((item) => {
                                        const isSelected = selectedHistoryItem?.id === item.id;
                                        return (
                                            <div key={item.id} style={{ position: "relative" }}>
                                                <button
                                                    className={`historyItem ${isSelected ? "historyItemActive" : ""}`}
                                                    onClick={() => setSelectedHistoryItem(item)}
                                                    style={{ paddingRight: 48 }}
                                                >
                                                    <div className="historyTitle">
                                                        {item.lecture_title || "제목 없음"}
                                                    </div>
                                                </button>

                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        deleteQuizHistory(item.id);
                                                    }}
                                                    title="기록 삭제"
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
                                                    }}
                                                >
                                                    🗑️
                                                </button>
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
                                <div className="quizHistoryDate" style={{ fontSize: 13, marginBottom: 16 }}>{selectedHistoryItem.created_at ? new Date(selectedHistoryItem.created_at).toLocaleString("ko-KR") : "날짜 없음"}</div>
                                <div className="quizList">
                                    {(selectedHistoryItem.results || []).map((r, idx) => (
                                        <div key={idx} className={`quizItem historyResultBox${r.isCorrect === true ? ' correct' : r.isCorrect === false ? ' wrong' : ''}`} style={{ borderColor: r.isCorrect === true ? "#bbf7d0" : r.isCorrect === false ? "#fecaca" : undefined }}>
                                            <div className="quizQuestion" style={{ marginBottom: 6 }}>{r.isCorrect === true ? "✅" : r.isCorrect === false ? "❌" : "➖"} Q{idx + 1}. {r.question}</div>
                                            <div className="historyAnswerLabel" style={{ fontSize: 13, marginBottom: 4 }}><strong>내 답변:</strong> {r.userAnswer || "미응답"}</div>
                                            <div className="historyAnswerMeta" style={{ fontSize: 13, marginBottom: 4 }}><strong>모범 답안:</strong> {r.answer}</div>
                                            {r.feedback && <div className="historyFeedbackBox" style={{ fontSize: 13, borderRadius: 8, padding: "6px 10px" }}>💬 {r.feedback}</div>}
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
            </main>
            </div>
        </div>
    );
}

export default App;