import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { io } from "socket.io-client";

const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";

const socket = io(API_BASE_URL, {
  transports: ["websocket", "polling"],
});

export default function App() {
    const [currentScreen, setCurrentScreen] = useState("login");
    const [selectedHistory, setSelectedHistory] = useState(null);

    const [loginEmail, setLoginEmail] = useState("");
    const [loginPassword, setLoginPassword] = useState("");

    const [signupName, setSignupName] = useState("");
    const [signupEmail, setSignupEmail] = useState("");
    const [signupPassword, setSignupPassword] = useState("");
    const [signupPasswordConfirm, setSignupPasswordConfirm] = useState("");

    const [authError, setAuthError] = useState("");
    const [isAuthLoading, setIsAuthLoading] = useState(false);

    const [showSettings, setShowSettings] = useState(false);

    const [lectureTitle, setLectureTitle] = useState("머신러닝 개론 1주차");
    const [rawText, setRawText] = useState("테스트라 아직 STT변환은 아직입니다.");
    const [notes, setNotes] = useState([]);
    const [keywords, setKeywords] = useState([]);
    const [quiz, setQuiz] = useState([]);
    const [history, setHistory] = useState([]);
    const [answers, setAnswers] = useState({});
    const [generated, setGenerated] = useState(false);

    const [isRecording, setIsRecording] = useState(false);
    const [audioUrl, setAudioUrl] = useState("");
    const [recordingStatus, setRecordingStatus] = useState("녹음 대기 중");

    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isChatExpanded, setIsChatExpanded] = useState(false);
    const [chatTab, setChatTab] = useState("friends");
    const [activeRoomId, setActiveRoomId] = useState(null);
    const [chatInput, setChatInput] = useState("");
    const fileInputRef = useRef(null);

    const [chatSize, setChatSize] = useState({ width: 360, height: 540 });
    const [resizing, setResizing] = useState(false);

    const [myProfile, setMyProfile] = useState({
        name: "최문정",
        status: "우리 팀 아자아자 파이팅~~",
        icon: "👽"
    });

    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [editName, setEditName] = useState("");
    const [editStatus, setEditStatus] = useState("");
    const [editIcon, setEditIcon] = useState("");

    const [showGroupCreate, setShowGroupCreate] = useState(false);
    const [showInviteMenu, setShowInviteMenu] = useState(false);
    const [selectedFriends, setSelectedFriends] = useState([]);

    const [messages, setMessages] = useState({});

    const friends = [
        { id: "f1", name: "이한서", status: "...", type: "individual" },
        { id: "f2", name: "전찬구", status: ".", type: "individual" },
        { id: "f3", name: "김서진", status: "^_^", type: "individual" },
        { id: "f4", name: "김승민", status: " ", type: "individual" }
    ];

    const [chatRooms, setChatRooms] = useState([
        { id: 1, type: "group", name: "캡스톤 9조", participants: ["f1", "f2", "f3"], lastMessage: "제가 어제 정리한 부분도 올릴게요!", time: "오전 10:10", unread: 2 },
        { id: 2, type: "individual", name: "이한서", participants: ["f1"], lastMessage: "혹시 프론트엔드쪽 추가 수정사항 있을까요?", time: "오전 09:30", unread: 0 },
        { id: 3, type: "group", name: "정보처리기사 스터디", participants: ["f4"], lastMessage: "내일까지 과제 제출 꼭 부탁드립니다", time: "어제", unread: 0 }
    ]);

    useEffect(() => {
        const savedUser = localStorage.getItem("user");
        if (savedUser) {
            const user = JSON.parse(savedUser);
            setMyProfile(user);
            setCurrentScreen("home");
            socket.emit("join_room", { user_id: user.id });
        }
    }, []);

    useEffect(() => {
        socket.on("receive_message", (data) => {
            console.log("서버에서 받은 메시지:", data);
            setMessages((prev) => ({
                ...prev,
                [data.roomId]: [...(prev[data.roomId] || []), data.message]
            }));
        });

        return () => socket.off("receive_message");
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!loginEmail || !loginPassword) {
            setAuthError("이메일과 비밀번호를 모두 입력해주세요.");
            return;
        }

        setAuthError("");
        setIsAuthLoading(true);

        try {
            const response = await fetch(`${API_BASE_URL}/api/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: loginEmail, password: loginPassword }),
            });

            const data = await response.json();

            if (response.ok) {
                const user = {
                    id: data.user.user_id,
                    name: data.user.name,
                    status: "캡스톤 프로젝트 진행 중!",
                    icon: data.user.icon || "👽"
                };

                setMyProfile(user);
                localStorage.setItem("user", JSON.stringify(user));
                setIsAuthLoading(false);
                setCurrentScreen("home");
                socket.emit("join_room", { user_id: user.id });
            } else {
                setAuthError(data.message);
                setIsAuthLoading(false);
            }
        } catch (error) {
            setAuthError("서버 연결 실패!");
            setIsAuthLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem("user");
        setCurrentScreen("login");
        setShowSettings(false);
        setLoginEmail("");
        setLoginPassword("");
        setHistory([]);
        setSelectedHistory(null);
        setMyProfile({ id: null, name: "", status: "", icon: "👽" });
    };

    const handleSignup = async (e) => {
        e.preventDefault();
        if (!signupName || !signupEmail || !signupPassword || !signupPasswordConfirm) {
            setAuthError("모든 항목을 빠짐없이 입력해주세요.");
            return;
        }
        if (signupPassword !== signupPasswordConfirm) {
            setAuthError("비밀번호가 일치하지 않습니다.");
            return;
        }

        setAuthError("");
        setIsAuthLoading(true);

        try {
            const response = await fetch(`${API_BASE_URL}/api/signup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: signupName,
                    email: signupEmail,
                    password: signupPassword
                }),
            });

            const data = await response.json();

            if (response.ok) {
                alert("회원가입 성공! 이제 로그인해보세요.");
                setCurrentScreen("login");
                setIsAuthLoading(false);
            } else {
                setAuthError(data.message);
                setIsAuthLoading(false);
            }
        } catch (error) {
            setAuthError("서버 연결 실패! 백엔드 서버가 켜져 있는지 확인하세요.");
            setIsAuthLoading(false);
        }
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!resizing) return;

            const newWidth = window.innerWidth - e.clientX - 30;
            const newHeight = window.innerHeight - e.clientY - 109;

            setChatSize({
                width: Math.max(300, Math.min(newWidth, window.innerWidth - 60)),
                height: Math.max(400, Math.min(newHeight, window.innerHeight - 150))
            });
        };

        const handleMouseUp = () => setResizing(false);

        if (resizing) {
            window.addEventListener("mousemove", handleMouseMove);
            window.addEventListener("mouseup", handleMouseUp);
        }

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [resizing]);

    useEffect(() => {
        return () => {
            if (audioUrl) URL.revokeObjectURL(audioUrl);
        };
    }, [audioUrl]);

    async function handleStartRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            setRecordingStatus("녹음 중...");
            setAudioUrl("");

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunksRef.current.push(event.data);
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
                setAudioUrl(URL.createObjectURL(audioBlob));
                setRecordingStatus("녹음 완료");
                stream.getTracks().forEach((track) => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
        } catch (error) {
            setRecordingStatus("마이크 권한이 없거나 녹음을 시작할 수 없습니다.");
        }
    }

    function handleStopRecording() {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    }

    const stopWords = new Set([
        "은", "는", "이", "가", "을", "를", "에", "의", "과", "와", "도", "으로", "에서",
        "하다", "하는", "하고", "한다", "있다", "주어진", "대표적인", "반복적으로",
        "위해", "함수는", "방법이다", "기술이다"
    ]);

    const sentenceList = useMemo(
        () => rawText.split(/(?<=[.!?다])\s+/).map((s) => s.trim()).filter(Boolean),
        [rawText]
    );

    function extractKeywords(text) {
        const words = text
            .replace(/[^가-힣a-zA-Z0-9\s]/g, " ")
            .split(/\s+/)
            .map((w) => w.trim())
            .filter((w) => w.length >= 2 && !stopWords.has(w));

        const freq = {};
        words.forEach((w) => {
            freq[w] = (freq[w] || 0) + 1;
        });

        return Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([word, count]) => ({ word, count }));
    }

    function buildSummary(sentences) {
        return sentences.slice(0, 3).map((s, i) => ({ id: i + 1, text: s }));
    }

    function buildQuiz(summaryKeywords, sentences) {
        const generatedQuizzes = [];
        let quizId = 1;

        summaryKeywords.slice(0, 3).forEach((keywordObj) => {
            const word = keywordObj.word;
            const targetSentence = sentences.find((s) => s.includes(word));

            if (targetSentence) {
                generatedQuizzes.push({
                    id: quizId++,
                    type: "빈칸 채우기",
                    question: `다음 문장의 빈칸에 들어갈 알맞은 핵심 단어는?\n"${targetSentence.replace(new RegExp(word, "g"), "[ ❓ ]")}"`,
                    answer: word,
                    explanation: `원본 문장: ${targetSentence}`,
                });
            }
        });

        if (generatedQuizzes.length === 0 && sentences.length > 0) {
            generatedQuizzes.push({
                id: quizId++,
                type: "OX",
                question: `강의 내용 중에 다음 내용이 언급되었다.\n"${sentences[0]}"`,
                answer: "O",
                explanation: "실제 강의 텍스트에 포함된 문장입니다.",
            });
        }

        return generatedQuizzes;
    }

    const fetchMyLectures = async () => {
        if (!myProfile.id) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/lectures/${myProfile.id}`);
            const data = await response.json();

            if (response.ok) {
                const formattedData = data.map((lec) => {
                    const sData = JSON.parse(lec.summary_data);
                    return {
                        title: lec.title,
                        createdAt: new Date(lec.created_at).toLocaleString("ko-KR"),
                        summaryCount: sData.notes?.length || 0,
                        quizCount: sData.quiz?.length || 0,
                        savedRawText: lec.raw_text,
                        savedNotes: sData.notes || [],
                        savedKeywords: sData.keywords || [],
                        savedQuiz: sData.quiz || []
                    };
                });

                setHistory(formattedData);
            }
        } catch (e) {
            console.error("강의 목록 불러오기 실패:", e);
        }
    };

    useEffect(() => {
        if (myProfile?.id) {
            fetchMyLectures();
        }
    }, [myProfile?.id]);

    async function handleGenerate() {
        console.log("내 아이디:", myProfile.id);

        const newKeywords = extractKeywords(rawText);
        const newNotes = buildSummary(sentenceList);
        const newQuiz = buildQuiz(newKeywords, sentenceList);

        setKeywords(newKeywords);
        setNotes(newNotes);
        setQuiz(newQuiz);
        setGenerated(true);
        setAnswers({});

        setHistory((prev) => [
            {
                title: lectureTitle,
                createdAt: new Date().toLocaleString("ko-KR"),
                summaryCount: newNotes.length,
                quizCount: newQuiz.length,
                savedRawText: rawText,
                savedNotes: newNotes,
                savedKeywords: newKeywords,
                savedQuiz: newQuiz,
            },
            ...prev
        ]);

        try {
            const response = await fetch(`${API_BASE_URL}/api/lectures`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: myProfile.id,
                    title: lectureTitle,
                    raw_text: rawText,
                    summary_data: { notes: newNotes, keywords: newKeywords, quiz: newQuiz }
                }),
            });

            if (response.ok) {
                fetchMyLectures();
            }
        } catch (error) {
            console.error(error);
        }
    }

    function handleReset() {
        setRawText("");
        setNotes([]);
        setKeywords([]);
        setQuiz([]);
        setGenerated(false);
        setAnswers({});
        setAudioUrl("");
        setRecordingStatus("녹음 대기 중");
    }

    function grade() {
        let correct = 0;

        quiz.forEach((q) => {
            if (
                (answers[q.id] || "").trim().toUpperCase() &&
                q.answer.trim().toUpperCase().includes((answers[q.id] || "").trim().toUpperCase())
            ) {
                correct += 1;
            }
        });

        return {
            correct,
            total: quiz.length,
            score: quiz.length ? Math.round((correct / quiz.length) * 100) : 0
        };
    }

    const result = grade();

    function gradeSavedQuiz() {
        if (!selectedHistory || !selectedHistory.savedQuiz) {
            return { correct: 0, total: 0, score: 0 };
        }

        let correct = 0;

        selectedHistory.savedQuiz?.forEach((q) => {
            const userAnswer = (answers[q.id] || "").trim().toUpperCase();
            const correctAnswer = q.answer.trim().toUpperCase();
            if (userAnswer === correctAnswer) {
                correct++;
            }
        });

        const total = selectedHistory.savedQuiz.length;
        const score = total > 0 ? Math.round((correct / total) * 100) : 0;

        return { correct, total, score };
    }

    const savedResult = gradeSavedQuiz();

    const sendMessage = () => {
        if (!chatInput.trim() || !activeRoomId) return;

        const now = new Date();
        const timeString = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

        const newMessage = {
            id: Date.now(),
            sender: "me",
            senderName: myProfile.name,
            text: chatInput,
            time: timeString,
            readCount: 0
        };

        setMessages((prev) => ({
            ...prev,
            [activeRoomId]: [...(prev[activeRoomId] || []), newMessage]
        }));

        socket.emit("send_message", {
            roomId: activeRoomId,
            message: { ...newMessage, sender: "other" }
        });

        setChatInput("");
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file || !activeRoomId) return;

        const now = new Date();
        const dateString = now.toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "long"
        });
        const timeString = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

        const newMessage = {
            id: Date.now(),
            sender: "me",
            type: "file",
            text: `📄 ${file.name}`,
            date: dateString,
            time: timeString,
            readCount: 0
        };

        setMessages((prev) => ({
            ...prev,
            [activeRoomId]: [...(prev[activeRoomId] || []), newMessage]
        }));

        setChatRooms((prev) =>
            prev.map((room) =>
                room.id === activeRoomId
                    ? { ...room, lastMessage: `파일: ${file.name}`, time: timeString }
                    : room
            )
        );

        e.target.value = "";
    };

    const handleRoomClick = (roomId) => {
        setActiveRoomId(roomId);
        setShowInviteMenu(false);
        setChatRooms((prev) =>
            prev.map((room) => (room.id === roomId ? { ...room, unread: 0 } : room))
        );
    };

    const handleFriendClick = (friend) => {
        const existingRoom = chatRooms.find(
            (r) => r.type === "individual" && r.participants.includes(friend.id)
        );

        if (existingRoom) {
            handleRoomClick(existingRoom.id);
        } else {
            const newRoomId = Date.now();
            const now = new Date();
            const dateString = now.toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "long"
            });

            setChatRooms((prev) => [
                {
                    id: newRoomId,
                    type: "individual",
                    name: friend.name,
                    participants: [friend.id],
                    lastMessage: "새로운 대화를 시작하세요.",
                    time: "방금",
                    unread: 0
                },
                ...prev
            ]);

            setMessages((prev) => ({
                ...prev,
                [newRoomId]: [
                    { id: 1, sender: "system", isDateOnly: true, date: dateString, time: "방금" }
                ]
            }));

            handleRoomClick(newRoomId);
        }
    };

    const handleCreateGroup = () => {
        if (selectedFriends.length === 0) {
            setShowGroupCreate(false);
            return;
        }

        const newRoomId = Date.now();
        const now = new Date();
        const dateString = now.toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "long"
        });
        const timeString = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

        const invitedNames = selectedFriends
            .map((id) => friends.find((f) => f.id === id).name)
            .join(", ");
        const roomName = selectedFriends
            .map((id) => friends.find((f) => f.id === id).name)
            .join(", ");
        const roomType = selectedFriends.length === 1 ? "individual" : "group";

        setChatRooms((prev) => [
            {
                id: newRoomId,
                type: roomType,
                name: roomName,
                participants: selectedFriends,
                lastMessage: "새로운 채팅방이 개설되었습니다.",
                time: timeString,
                unread: 0
            },
            ...prev
        ]);

        setMessages((prev) => ({
            ...prev,
            [newRoomId]: [
                {
                    id: 1,
                    sender: "system",
                    text: `${myProfile.name}님이 ${invitedNames}님을 초대했습니다.`,
                    date: dateString,
                    time: timeString
                }
            ]
        }));

        handleRoomClick(newRoomId);
        setShowGroupCreate(false);
        setSelectedFriends([]);
    };

    const handleInviteFriends = () => {
        if (selectedFriends.length === 0) {
            setShowInviteMenu(false);
            return;
        }

        const now = new Date();
        const dateString = now.toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "long"
        });
        const timeString = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

        const invitedNames = selectedFriends
            .map((id) => friends.find((f) => f.id === id).name)
            .join(", ");

        setChatRooms((prev) =>
            prev.map((r) => {
                if (r.id === activeRoomId) {
                    const newName =
                        r.type === "individual" || r.name.includes(",")
                            ? `${r.name}, ${invitedNames}`
                            : r.name;

                    return {
                        ...r,
                        type: "group",
                        name: newName,
                        participants: [...r.participants, ...selectedFriends]
                    };
                }
                return r;
            })
        );

        setMessages((prev) => ({
            ...prev,
            [activeRoomId]: [
                ...(prev[activeRoomId] || []),
                {
                    id: Date.now(),
                    sender: "system",
                    text: `${myProfile.name}님이 ${invitedNames}님을 초대했습니다.`,
                    date: dateString,
                    time: timeString
                }
            ]
        }));

        setShowInviteMenu(false);
        setSelectedFriends([]);
    };

    const handleEditProfileOpen = () => {
        setEditName(myProfile.name);
        setEditStatus(myProfile.status);
        setEditIcon(myProfile.icon);
        setIsEditingProfile(true);
    };

    const handleEditProfileSave = () => {
        const updatedProfile = {
            ...myProfile,
            name: editName,
            status: editStatus,
            icon: editIcon || "👽",
        };

        setMyProfile(updatedProfile);
        localStorage.setItem("user", JSON.stringify(updatedProfile));
        setIsEditingProfile(false);
    };

    const activeRoom = chatRooms.find((r) => r.id === activeRoomId);

    if (currentScreen === "login" || currentScreen === "signup") {
        return (
            <div
                style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    minHeight: "100vh",
                    backgroundColor: "#ffffff",
                    fontFamily: "'Pretendard', sans-serif",
                    gap: "250px",
                    padding: "20px"
                }}
            >
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <img
                        src={require("./다운로드.jpg")}
                        alt="Workspace 테마 이미지"
                        style={{ width: "100%", maxWidth: "350px", height: "auto", objectFit: "contain" }}
                    />
                </div>

                <div style={{ width: "100%", maxWidth: "360px", display: "flex", flexDirection: "column" }}>
                    <div style={{ fontSize: "3rem", marginBottom: "10px", color: "#4b8a66" }}>🎓</div>
                    <h2 style={{ color: "#212529", marginBottom: "8px", fontSize: "2.2rem", fontWeight: "800", letterSpacing: "-0.5px" }}>
                        Workspace
                    </h2>
                    <p style={{ color: "#868e96", marginBottom: "40px", fontSize: "0.95rem" }}>
                        AI 기반 실시간 강의 요약 및 통합 워크스페이스
                    </p>

                    {currentScreen === "login" ? (
                        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                            <input
                                type="email"
                                value={loginEmail}
                                onChange={(e) => setLoginEmail(e.target.value)}
                                placeholder="이메일 아이디"
                                style={{ padding: "14px", borderRadius: "8px", border: "1px solid #ced4da", fontSize: "0.95rem", outline: "none" }}
                            />
                            <input
                                type="password"
                                value={loginPassword}
                                onChange={(e) => setLoginPassword(e.target.value)}
                                placeholder="비밀번호"
                                style={{ padding: "14px", borderRadius: "8px", border: "1px solid #ced4da", fontSize: "0.95rem", outline: "none" }}
                            />
                            {authError && <div style={{ color: "#fa5252", fontSize: "0.85rem" }}>{authError}</div>}

                            <button
                                type="submit"
                                style={{
                                    padding: "15px",
                                    marginTop: "10px",
                                    borderRadius: "8px",
                                    border: "none",
                                    backgroundColor: isAuthLoading ? "#adb5bd" : "#4b8a66",
                                    color: "#fff",
                                    fontSize: "1rem",
                                    fontWeight: "bold",
                                    cursor: isAuthLoading ? "not-allowed" : "pointer"
                                }}
                                disabled={isAuthLoading}
                            >
                                {isAuthLoading ? "인증 처리 중..." : "로그인"}
                            </button>

                            <div style={{ marginTop: "20px", fontSize: "0.9rem", color: "#868e96", textAlign: "center" }}>
                                계정이 없으신가요?{" "}
                                <span
                                    onClick={() => {
                                        setCurrentScreen("signup");
                                        setAuthError("");
                                    }}
                                    style={{ color: "#4b8a66", fontWeight: "bold", cursor: "pointer" }}
                                >
                                    회원가입
                                </span>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                            <input
                                type="text"
                                value={signupName}
                                onChange={(e) => setSignupName(e.target.value)}
                                placeholder="이름 (실명 입력)"
                                style={{ padding: "14px", borderRadius: "8px", border: "1px solid #ced4da", fontSize: "0.95rem", outline: "none" }}
                            />
                            <input
                                type="email"
                                value={signupEmail}
                                onChange={(e) => setSignupEmail(e.target.value)}
                                placeholder="이메일 아이디"
                                style={{ padding: "14px", borderRadius: "8px", border: "1px solid #ced4da", fontSize: "0.95rem", outline: "none" }}
                            />
                            <input
                                type="password"
                                value={signupPassword}
                                onChange={(e) => setSignupPassword(e.target.value)}
                                placeholder="비밀번호"
                                style={{ padding: "14px", borderRadius: "8px", border: "1px solid #ced4da", fontSize: "0.95rem", outline: "none" }}
                            />
                            <input
                                type="password"
                                value={signupPasswordConfirm}
                                onChange={(e) => setSignupPasswordConfirm(e.target.value)}
                                placeholder="비밀번호 확인"
                                style={{ padding: "14px", borderRadius: "8px", border: "1px solid #ced4da", fontSize: "0.95rem", outline: "none" }}
                            />
                            {authError && <div style={{ color: "#fa5252", fontSize: "0.85rem" }}>{authError}</div>}

                            <button
                                type="submit"
                                style={{
                                    padding: "15px",
                                    marginTop: "10px",
                                    borderRadius: "8px",
                                    border: "none",
                                    backgroundColor: isAuthLoading ? "#adb5bd" : "#4b8a66",
                                    color: "#fff",
                                    fontSize: "1rem",
                                    fontWeight: "bold",
                                    cursor: isAuthLoading ? "not-allowed" : "pointer"
                                }}
                                disabled={isAuthLoading}
                            >
                                {isAuthLoading ? "회원가입 처리 중..." : "가입 완료하기"}
                            </button>

                            <div style={{ marginTop: "20px", fontSize: "0.9rem", color: "#868e96", textAlign: "center" }}>
                                이미 계정이 있으신가요?{" "}
                                <span
                                    onClick={() => {
                                        setCurrentScreen("login");
                                        setAuthError("");
                                    }}
                                    style={{ color: "#4b8a66", fontWeight: "bold", cursor: "pointer" }}
                                >
                                    로그인으로 돌아가기
                                </span>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="app">
            <div className="container" style={{ paddingBottom: "100px" }}>
                <div className="card">
                    <div
                        className="headerRow"
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            flexWrap: "wrap",
                            gap: "15px"
                        }}
                    >
                        <div>
                            <h1 style={{ margin: "0 0 10px 0" }}>AI 기반 실시간 강의 요약 및 퀴즈 생성 웹</h1>
                            <p className="subText" style={{ margin: 0 }}>
                                캡스톤 발표용 구현 프로토타입 — 텍스트 입력 기반 요약 / 키워드 추출 / 퀴즈 생성
                            </p>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                            <div className="badge">구현 범위: 강의 입력 · 요약 · 키워드 · 퀴즈</div>

                            <div style={{ position: "relative" }}>
                                <button
                                    onClick={() => setShowSettings(!showSettings)}
                                    style={{
                                        background: "none",
                                        border: "none",
                                        fontSize: "1.6rem",
                                        cursor: "pointer",
                                        color: "#495057",
                                        padding: "0 5px",
                                        display: "flex",
                                        alignItems: "center"
                                    }}
                                    title="설정"
                                >
                                    ⚙️
                                </button>

                                {showSettings && (
                                    <div
                                        style={{
                                            position: "absolute",
                                            top: "100%",
                                            right: 0,
                                            marginTop: "8px",
                                            backgroundColor: "#fff",
                                            borderRadius: "12px",
                                            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                                            border: "1px solid #e9ecef",
                                            overflow: "hidden",
                                            zIndex: 1000,
                                            minWidth: "130px"
                                        }}
                                    >
                                        <button
                                            onClick={handleLogout}
                                            style={{
                                                width: "100%",
                                                padding: "14px 20px",
                                                background: "none",
                                                border: "none",
                                                textAlign: "center",
                                                cursor: "pointer",
                                                fontSize: "0.95rem",
                                                color: "#fa5252",
                                                fontWeight: "bold"
                                            }}
                                        >
                                            로그아웃
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1.1fr 0.9fr",
                            gap: "24px",
                            marginTop: "22px"
                        }}
                    >
                        <section className="panel">
                            <div className="sectionTitle">강의 정보</div>

                            <label className="label">강의 제목</label>
                            <input
                                className="input"
                                value={lectureTitle}
                                onChange={(e) => setLectureTitle(e.target.value)}
                                placeholder="예: 머신러닝 개론 1주차"
                            />

                            <label className="label" style={{ marginTop: "12px" }}>강의 원문 / STT 텍스트</label>
                            <textarea
                                className="textarea"
                                value={rawText}
                                onChange={(e) => setRawText(e.target.value)}
                                placeholder="녹음된 음성의 STT 결과나 강의 내용을 붙여넣으세요."
                            />

                            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "14px" }}>
                                <button className="btn primary" onClick={handleGenerate}>요약/퀴즈 생성</button>
                                <button className="btn secondary" onClick={handleReset}>초기화</button>
                                {!isRecording ? (
                                    <button className="btn secondary" onClick={handleStartRecording}>녹음 시작</button>
                                ) : (
                                    <button className="btn danger" onClick={handleStopRecording}>녹음 종료</button>
                                )}
                            </div>

                            <div style={{ marginTop: "12px", color: "#6c757d", fontSize: "0.92rem" }}>
                                상태: {recordingStatus}
                            </div>

                            {audioUrl && (
                                <div style={{ marginTop: "12px" }}>
                                    <audio controls src={audioUrl} style={{ width: "100%" }} />
                                </div>
                            )}
                        </section>

                        <section className="panel">
                            <div className="sectionTitle">내 프로필</div>
                            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "14px" }}>
                                <div
                                    style={{
                                        width: "64px",
                                        height: "64px",
                                        borderRadius: "18px",
                                        backgroundColor: "#f1f3f5",
                                        display: "flex",
                                        justifyContent: "center",
                                        alignItems: "center",
                                        fontSize: "2rem"
                                    }}
                                >
                                    {myProfile.icon}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: "700", fontSize: "1.1rem" }}>{myProfile.name}</div>
                                    <div style={{ color: "#6c757d", marginTop: "4px" }}>{myProfile.status}</div>
                                </div>
                                <button className="btn secondary" onClick={handleEditProfileOpen}>수정</button>
                            </div>

                            {isEditingProfile && (
                                <div
                                    style={{
                                        border: "1px solid #e9ecef",
                                        borderRadius: "14px",
                                        padding: "14px",
                                        backgroundColor: "#fafafa",
                                        marginBottom: "16px"
                                    }}
                                >
                                    <label className="label">이름</label>
                                    <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} />

                                    <label className="label" style={{ marginTop: "10px" }}>상태메시지</label>
                                    <input className="input" value={editStatus} onChange={(e) => setEditStatus(e.target.value)} />

                                    <label className="label" style={{ marginTop: "10px" }}>아이콘</label>
                                    <input className="input" value={editIcon} onChange={(e) => setEditIcon(e.target.value)} placeholder="예: 👽" />

                                    <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                                        <button className="btn primary" onClick={handleEditProfileSave}>저장</button>
                                        <button className="btn secondary" onClick={() => setIsEditingProfile(false)}>취소</button>
                                    </div>
                                </div>
                            )}

                            <div className="sectionTitle" style={{ marginTop: "8px" }}>생성 결과</div>

                            {!generated ? (
                                <div style={{ color: "#868e96" }}>아직 생성된 결과가 없습니다.</div>
                            ) : (
                                <>
                                    <div className="resultBox">
                                        <h3>핵심 요약</h3>
                                        <ul>
                                            {notes.map((n) => (
                                                <li key={n.id}>{n.text}</li>
                                            ))}
                                        </ul>
                                    </div>

                                    <div className="resultBox">
                                        <h3>핵심 키워드</h3>
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                                            {keywords.map((k) => (
                                                <span key={k.word} className="chip">
                                                    {k.word} ({k.count})
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="resultBox">
                                        <h3>퀴즈</h3>
                                        {quiz.map((q) => (
                                            <div key={q.id} style={{ marginBottom: "16px" }}>
                                                <div style={{ fontWeight: "600", whiteSpace: "pre-line" }}>{q.question}</div>
                                                <input
                                                    className="input"
                                                    style={{ marginTop: "8px" }}
                                                    value={answers[q.id] || ""}
                                                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                                                    placeholder="정답 입력"
                                                />
                                                <div style={{ color: "#6c757d", fontSize: "0.9rem", marginTop: "6px" }}>
                                                    해설: {q.explanation}
                                                </div>
                                            </div>
                                        ))}
                                        <div style={{ marginTop: "8px", fontWeight: "700" }}>
                                            점수: {result.correct}/{result.total} ({result.score}점)
                                        </div>
                                    </div>
                                </>
                            )}
                        </section>
                    </div>

                    <div style={{ marginTop: "28px" }}>
                        <div className="sectionTitle">저장된 강의 기록</div>
                        {history.length === 0 ? (
                            <div style={{ color: "#868e96" }}>저장된 강의 기록이 없습니다.</div>
                        ) : (
                            <div className="historyList">
                                {history.map((item, index) => (
                                    <div
                                        key={index}
                                        className="historyCard"
                                        onClick={() => {
                                            setSelectedHistory(item);
                                            setAnswers({});
                                        }}
                                    >
                                        <div style={{ fontWeight: "700" }}>{item.title}</div>
                                        <div style={{ color: "#6c757d", marginTop: "6px" }}>{item.createdAt}</div>
                                        <div style={{ color: "#495057", marginTop: "8px", fontSize: "0.94rem" }}>
                                            요약 {item.summaryCount}개 · 퀴즈 {item.quizCount}개
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {selectedHistory && (
                        <div style={{ marginTop: "28px" }}>
                            <div className="sectionTitle">선택한 강의 상세</div>

                            <div className="resultBox">
                                <h3>{selectedHistory.title}</h3>
                                <div style={{ color: "#6c757d", marginBottom: "10px" }}>{selectedHistory.createdAt}</div>
                                <div style={{ whiteSpace: "pre-wrap" }}>{selectedHistory.savedRawText}</div>
                            </div>

                            <div className="resultBox">
                                <h3>요약</h3>
                                <ul>
                                    {selectedHistory.savedNotes?.map((n) => (
                                        <li key={n.id}>{n.text}</li>
                                    ))}
                                </ul>
                            </div>

                            <div className="resultBox">
                                <h3>키워드</h3>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                                    {selectedHistory.savedKeywords?.map((k) => (
                                        <span key={k.word} className="chip">
                                            {k.word} ({k.count})
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className="resultBox">
                                <h3>퀴즈</h3>
                                {selectedHistory.savedQuiz?.map((q) => (
                                    <div key={q.id} style={{ marginBottom: "16px" }}>
                                        <div style={{ fontWeight: "600", whiteSpace: "pre-line" }}>{q.question}</div>
                                        <input
                                            className="input"
                                            style={{ marginTop: "8px" }}
                                            value={answers[q.id] || ""}
                                            onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                                            placeholder="정답 입력"
                                        />
                                        <div style={{ color: "#6c757d", fontSize: "0.9rem", marginTop: "6px" }}>
                                            해설: {q.explanation}
                                        </div>
                                    </div>
                                ))}
                                <div style={{ marginTop: "8px", fontWeight: "700" }}>
                                    점수: {savedResult.correct}/{savedResult.total} ({savedResult.score}점)
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {!isChatOpen ? (
                <button
                    onClick={() => setIsChatOpen(true)}
                    style={{
                        position: "fixed",
                        right: "28px",
                        bottom: "28px",
                        width: "64px",
                        height: "64px",
                        borderRadius: "50%",
                        border: "none",
                        backgroundColor: "#4b8a66",
                        color: "#fff",
                        fontSize: "1.8rem",
                        cursor: "pointer",
                        boxShadow: "0 10px 30px rgba(75,138,102,0.35)",
                        zIndex: 999
                    }}
                >
                    💬
                </button>
            ) : (
                <div
                    style={{
                        position: "fixed",
                        right: "28px",
                        bottom: "28px",
                        width: isChatExpanded ? chatSize.width : 360,
                        height: isChatExpanded ? chatSize.height : 540,
                        backgroundColor: "#fff",
                        borderRadius: "20px",
                        boxShadow: "0 20px 40px rgba(0,0,0,0.18)",
                        overflow: "hidden",
                        zIndex: 999,
                        display: "flex",
                        flexDirection: "column",
                        border: "1px solid #e9ecef"
                    }}
                >
                    <div
                        style={{
                            padding: "14px 18px",
                            backgroundColor: "#4b8a66",
                            color: "white",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between"
                        }}
                    >
                        <div style={{ fontWeight: "700" }}>
                            {activeRoom ? activeRoom.name : "채팅"}
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                            <button
                                onClick={() => setIsChatExpanded(!isChatExpanded)}
                                style={{ background: "none", border: "none", color: "white", cursor: "pointer", fontSize: "1rem" }}
                            >
                                {isChatExpanded ? "🗗" : "🗖"}
                            </button>
                            <button
                                onClick={() => {
                                    setIsChatOpen(false);
                                    setActiveRoomId(null);
                                }}
                                style={{ background: "none", border: "none", color: "white", cursor: "pointer", fontSize: "1rem" }}
                            >
                                ✕
                            </button>
                        </div>
                    </div>

                    {!activeRoomId ? (
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: "#ffffff" }}>
                            <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f3f5" }}>
                                <div style={{ fontWeight: "700" }}>
                                    {chatTab === "friends" ? "친구 목록" : "채팅방 목록"}
                                </div>
                                <button className="btn secondary" onClick={() => setShowGroupCreate(true)}>+ 그룹 생성</button>
                            </div>

                            {showGroupCreate && (
                                <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f3f5", backgroundColor: "#fafafa" }}>
                                    <div style={{ fontWeight: "700", marginBottom: "10px" }}>그룹원 선택</div>
                                    <div style={{ display: "grid", gap: "8px" }}>
                                        {friends.map((f) => (
                                            <label key={f.id} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedFriends.includes(f.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedFriends([...selectedFriends, f.id]);
                                                        } else {
                                                            setSelectedFriends(selectedFriends.filter((id) => id !== f.id));
                                                        }
                                                    }}
                                                />
                                                <span>{f.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                                        <button className="btn primary" onClick={handleCreateGroup}>생성</button>
                                        <button className="btn secondary" onClick={() => {
                                            setShowGroupCreate(false);
                                            setSelectedFriends([]);
                                        }}>취소</button>
                                    </div>
                                </div>
                            )}

                            {chatTab === "friends" ? (
                                <div style={{ flex: 1, overflowY: "auto" }}>
                                    {friends.map((friend) => (
                                        <div
                                            key={friend.id}
                                            onClick={() => handleFriendClick(friend)}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                padding: "14px 16px",
                                                borderBottom: "1px solid #f8f9fa",
                                                cursor: "pointer"
                                            }}
                                        >
                                            <div
                                                style={{
                                                    width: "44px",
                                                    height: "44px",
                                                    borderRadius: "14px",
                                                    backgroundColor: "#f1f3f5",
                                                    display: "flex",
                                                    justifyContent: "center",
                                                    alignItems: "center",
                                                    fontSize: "1.2rem",
                                                    marginRight: "12px"
                                                }}
                                            >
                                                👤
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: "700" }}>{friend.name}</div>
                                                <div style={{ color: "#868e96", fontSize: "0.9rem" }}>{friend.status}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ flex: 1, overflowY: "auto" }}>
                                    {chatRooms.map((room) => (
                                        <div
                                            key={room.id}
                                            onClick={() => handleRoomClick(room.id)}
                                            style={{
                                                padding: "14px 16px",
                                                borderBottom: "1px solid #f8f9fa",
                                                cursor: "pointer",
                                                display: "flex",
                                                alignItems: "center"
                                            }}
                                        >
                                            <div
                                                style={{
                                                    width: "44px",
                                                    height: "44px",
                                                    borderRadius: "14px",
                                                    backgroundColor: room.type === "group" ? "#e9f2eb" : "#f1f3f5",
                                                    color: room.type === "group" ? "#3b7a57" : "#495057",
                                                    display: "flex",
                                                    justifyContent: "center",
                                                    alignItems: "center",
                                                    fontSize: "1.2rem",
                                                    marginRight: "15px"
                                                }}
                                            >
                                                {room.type === "group" ? "👥" : "👤"}
                                            </div>
                                            <div style={{ flex: 1, overflow: "hidden" }}>
                                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                                                    <div style={{ fontWeight: "bold", fontSize: "1rem", color: "#343a40", textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden" }}>
                                                        {room.name}
                                                    </div>
                                                    <div style={{ fontSize: "0.75rem", color: "#adb5bd", flexShrink: 0 }}>{room.time}</div>
                                                </div>
                                                <div style={{ fontSize: "0.85rem", color: "#868e96", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                    {room.lastMessage}
                                                </div>
                                            </div>
                                            {room.unread > 0 && (
                                                <div
                                                    style={{
                                                        backgroundColor: "#4b8a66",
                                                        color: "white",
                                                        borderRadius: "6px",
                                                        padding: "2px 8px",
                                                        fontSize: "0.75rem",
                                                        fontWeight: "bold",
                                                        marginLeft: "10px"
                                                    }}
                                                >
                                                    {room.unread}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div style={{ display: "flex", borderTop: "1px solid #f1f3f5", backgroundColor: "#ffffff" }}>
                                <button
                                    onClick={() => setChatTab("friends")}
                                    style={{
                                        flex: 1,
                                        padding: "15px 0",
                                        border: "none",
                                        background: "none",
                                        cursor: "pointer",
                                        color: chatTab === "friends" ? "#212529" : "#adb5bd",
                                        fontWeight: chatTab === "friends" ? "bold" : "normal",
                                        fontSize: "1rem"
                                    }}
                                >
                                    👤 친구
                                </button>
                                <button
                                    onClick={() => setChatTab("chats")}
                                    style={{
                                        flex: 1,
                                        padding: "15px 0",
                                        border: "none",
                                        background: "none",
                                        cursor: "pointer",
                                        color: chatTab === "chats" ? "#212529" : "#adb5bd",
                                        fontWeight: chatTab === "chats" ? "bold" : "normal",
                                        fontSize: "1rem"
                                    }}
                                >
                                    💬 채팅방
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: "#ffffff" }}>
                            {showInviteMenu ? (
                                <div style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: "#fff", zIndex: 50 }}>
                                    <div style={{ padding: "10px 20px", fontSize: "0.85rem", color: "#adb5bd", fontWeight: "bold" }}>
                                        초대할 친구 선택
                                    </div>
                                    <div style={{ flex: 1, overflowY: "auto" }}>
                                        {friends.filter((f) => !activeRoom.participants.includes(f.id)).map((f) => (
                                            <label key={f.id} style={{ display: "flex", padding: "12px 20px", alignItems: "center", cursor: "pointer", borderBottom: "1px solid #f8f9fa" }}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedFriends.includes(f.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setSelectedFriends([...selectedFriends, f.id]);
                                                        else setSelectedFriends(selectedFriends.filter((id) => id !== f.id));
                                                    }}
                                                    style={{ width: "18px", height: "18px", accentColor: "#4b8a66", marginRight: "15px" }}
                                                />
                                                <div style={{ width: "40px", height: "40px", borderRadius: "12px", backgroundColor: "#f1f3f5", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "1.1rem", marginRight: "12px" }}>
                                                    👤
                                                </div>
                                                <span style={{ fontWeight: "bold", color: "#343a40" }}>{f.name}</span>
                                            </label>
                                        ))}
                                        {friends.filter((f) => !activeRoom.participants.includes(f.id)).length === 0 && (
                                            <div style={{ padding: "30px", textAlign: "center", color: "#adb5bd" }}>
                                                더 이상 초대할 친구가 없습니다.
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ padding: "15px 20px", borderTop: "1px solid #f1f3f5", display: "flex", gap: "10px" }}>
                                        <button onClick={() => setShowInviteMenu(false)} className="btn secondary" style={{ flex: 1 }}>취소</button>
                                        <button onClick={handleInviteFriends} className="btn primary" style={{ flex: 1 }}>초대하기</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f3f5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <button className="btn secondary" onClick={() => setActiveRoomId(null)}>← 뒤로</button>
                                        <div style={{ fontWeight: "700" }}>{activeRoom?.name}</div>
                                        <button className="btn secondary" onClick={() => setShowInviteMenu(true)}>친구 초대</button>
                                    </div>

                                    <div style={{ flex: 1, padding: "16px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "14px" }}>
                                        {(messages[activeRoomId] || []).map((msg, index, arr) => {
                                            const showDateDivider = index === 0 || msg.date !== arr[index - 1]?.date;

                                            return (
                                                <React.Fragment key={msg.id}>
                                                    {showDateDivider && (
                                                        <div style={{ display: "flex", justifyContent: "center", margin: "10px 0" }}>
                                                            <div style={{ backgroundColor: "#f1f3f5", color: "#868e96", fontSize: "0.75rem", padding: "4px 14px", borderRadius: "20px" }}>
                                                                {msg.date || "오늘"}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            flexDirection: "column",
                                                            alignItems:
                                                                msg.sender === "me"
                                                                    ? "flex-end"
                                                                    : msg.sender === "system"
                                                                    ? "center"
                                                                    : "flex-start"
                                                        }}
                                                    >
                                                        {msg.sender === "system" ? (
                                                            !msg.isDateOnly && (
                                                                <div style={{ fontSize: "0.75rem", color: "#868e96", margin: "10px 0", backgroundColor: "#f8f9fa", padding: "4px 12px", borderRadius: "12px" }}>
                                                                    {msg.text}
                                                                </div>
                                                            )
                                                        ) : (
                                                            <div style={{ display: "flex", flexDirection: "column", alignItems: msg.sender === "me" ? "flex-end" : "flex-start" }}>
                                                                {msg.sender === "other" && msg.senderName && (
                                                                    <div style={{ fontSize: "0.8rem", color: "#495057", marginBottom: "4px", marginLeft: "4px", fontWeight: "bold" }}>
                                                                        {msg.senderName}
                                                                    </div>
                                                                )}
                                                                <div
                                                                    style={{
                                                                        maxWidth: "75%",
                                                                        padding: "10px 14px",
                                                                        borderRadius: "16px",
                                                                        backgroundColor: msg.sender === "me" ? "#4b8a66" : "#f1f3f5",
                                                                        color: msg.sender === "me" ? "#fff" : "#212529",
                                                                        whiteSpace: "pre-wrap",
                                                                        wordBreak: "break-word"
                                                                    }}
                                                                >
                                                                    {msg.text}
                                                                </div>
                                                                <div style={{ fontSize: "0.72rem", color: "#adb5bd", marginTop: "4px" }}>
                                                                    {msg.time}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </React.Fragment>
                                            );
                                        })}
                                    </div>

                                    <div style={{ padding: "12px", borderTop: "1px solid #f1f3f5", display: "flex", gap: "8px", alignItems: "center" }}>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            style={{ display: "none" }}
                                            onChange={handleFileSelect}
                                        />
                                        <button className="btn secondary" onClick={() => fileInputRef.current?.click()}>
                                            📎
                                        </button>
                                        <input
                                            className="input"
                                            style={{ flex: 1 }}
                                            value={chatInput}
                                            onChange={(e) => setChatInput(e.target.value)}
                                            placeholder="메시지를 입력하세요"
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") sendMessage();
                                            }}
                                        />
                                        <button className="btn primary" onClick={sendMessage}>전송</button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {isChatExpanded && (
                        <div
                            onMouseDown={() => setResizing(true)}
                            style={{
                                position: "absolute",
                                right: 0,
                                bottom: 0,
                                width: "18px",
                                height: "18px",
                                cursor: "nwse-resize",
                                background: "linear-gradient(135deg, transparent 50%, #ced4da 50%)"
                            }}
                        />
                    )}
                </div>
            )}
        </div>
    );
}