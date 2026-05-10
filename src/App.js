import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { io } from "socket.io-client";
import BoardPage from "./BoardPage";

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
        subjectType: parsed.subjectType || "general",
        analysisTitle: parsed.analysisTitle || "",
        summary: parsed.summary || "",
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
        quiz: Array.isArray(parsed.quiz) ? parsed.quiz.map(normalizeQuizItem) : [],
        files: Array.isArray(parsed.files) ? parsed.files : [],
        keywordExplanations: parsed.keywordExplanations || {},
        studyGuide: parsed.studyGuide || {
            coreConcepts: [],
            codeHighlights: [],
            formulas: [],
            problemSolvingSteps: [],
            examPoints: [],
            commonMistakes: [],
            practiceTasks: [],
        },
    };
}

function displayFileName(file) {
    return file?.originalName || file?.filename || "첨부파일";
}

function checkCorrect(userAnswer, answer) {
    return String(userAnswer || "").trim().toLowerCase() ===
        String(answer || "").trim().toLowerCase();
}

function normalizeQuizItem(item) {
    const rawType = String(item?.type || "").toLowerCase();

    let type = "short";

    if (
        rawType === "mcq" ||
        rawType.includes("객관") ||
        rawType.includes("choice") ||
        rawType.includes("multiple")
    ) {
        type = "mcq";
    } else if (
        rawType === "ox" ||
        rawType === "o/x" ||
        rawType.includes("ox") ||
        rawType.includes("참거짓") ||
        rawType.includes("true")
    ) {
        type = "ox";
    }

    const choices =
        Array.isArray(item?.choices)
            ? item.choices
            : Array.isArray(item?.options)
                ? item.options
                : Array.isArray(item?.보기)
                    ? item.보기
                    : [];

    return {
        ...item,
        type,
        choices,
        question: item?.question || item?.문제 || "",
        answer: item?.answer || item?.정답 || "",
    };
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
    if (score >= 100) return { label: "매우 중요", color: "#dc2626", bg: "#fef2f2" };
    if (score >= 80) return { label: "중요", color: "#f59e0b", bg: "#fffbeb" };
    if (score >= 60) return { label: "보통", color: "#2563eb", bg: "#eff6ff" };
    return { label: "낮음", color: "#6b7280", bg: "#f9fafb" };
}

// 슬라이드 쇼를 위한 이미지 리스트 (여기에 이미지 URL들을 넣으세요)
const LANDING_IMAGES = [
    "/images/image1.png",
    "/images/image2.png",
    "/images/image3.png"
];
function App() {
    const [keywordExplanations, setKeywordExplanations] = useState({});
    const [lectureFiles, setLectureFiles] = useState([]);
    const fileInputRef = useRef(null);
    const [projectView, setProjectView] = useState("chat");
    const [showReviewContent, setShowReviewContent] = useState(true);
    const [isDarkMode, setIsDarkMode] = useState(() => {
        return localStorage.getItem("darkMode") === "true";
    });
    useEffect(() => {
        localStorage.setItem("darkMode", String(isDarkMode));
    }, [isDarkMode]);
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
    const [showNotiMenu, setShowNotiMenu] = useState(false);
    const [toastMessage, setToastMessage] = useState("");
    const [notifications, setNotifications] = useState(() => {
        try {
            const stored = localStorage.getItem("unread_notifications");
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    });

    useEffect(() => {
        localStorage.setItem("unread_notifications", JSON.stringify(notifications));
    }, [notifications]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!event.target.closest(".profileMenuWrap")) {
                setShowProfileMenu(false);
                setShowNotiMenu(false);
            }
        };
        if (showProfileMenu || showNotiMenu) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [showProfileMenu, showNotiMenu]);

    const [lectureTitle, setLectureTitle] = useState("");
    const [lectureText, setLectureText] = useState("");
    const [summary, setSummary] = useState("");
    const [keywords, setKeywords] = useState([]);
    const [quiz, setQuiz] = useState([]);
    const [subjectType, setSubjectType] = useState("general");
    const [analysisTitle, setAnalysisTitle] = useState("");
    const [studyGuide, setStudyGuide] = useState({
        coreConcepts: [],
        codeHighlights: [],
        formulas: [],
        problemSolvingSteps: [],
        examPoints: [],
        commonMistakes: [],
        practiceTasks: [],
    });

    const [lectureMessage, setLectureMessage] = useState("");
    const [savedLectures, setSavedLectures] = useState([]);
    const [selectedLecture, setSelectedLecture] = useState(null);
    const [showRawText, setShowRawText] = useState(false);
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
    const [showRecordingChoice, setShowRecordingChoice] = useState(false);
    const [showAppendAsk, setShowAppendAsk] = useState(false);
    const [currentImgIndex, setCurrentImgIndex] = useState(0);

    const [folders, setFolders] = useState([]);
    const [activeLectureFolder, setActiveLectureFolder] = useState("ALL");

    // 새 강의 저장 시 선택할 폴더. 빈 문자열이면 폴더 없이 저장.
    const [newLectureFolderName, setNewLectureFolderName] = useState("");

    const [folderPicker, setFolderPicker] = useState({
        open: false,
        mode: null, // "existing" 또는 "new"
        lecture: null,
    });

    const [createFolderModal, setCreateFolderModal] = useState({
        open: false,
        name: "",
        selectAfterCreate: false,
        mode: null,
        lecture: null,

        // 폴더 이름 수정용
        editMode: false,
        folderId: null,
        originalName: "",
    });

    const [deleteFolderModal, setDeleteFolderModal] = useState({
        open: false,
        folder: null,
    });

    const [deleteLectureModal, setDeleteLectureModal] = useState({
        open: false,
        lecture: null,
    });

    const fetchFolders = useCallback(async () => {
        if (!user?.user_id) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/folders`, {
                headers: getAuthHeaders(),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || "폴더 목록 불러오기 실패");
            }

            setFolders(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("폴더 로드 실패:", err);
        }
    }, [user?.user_id]);

    useEffect(() => {
        if (isLoggedIn && user?.user_id) {
            fetchFolders();
        }
    }, [isLoggedIn, user?.user_id, fetchFolders]);

    const handleCreateFolder = (options = {}) => {
        setCreateFolderModal({
            open: true,
            name: "",
            selectAfterCreate: !!options.selectAfterCreate,
            mode: options.mode || null,
            lecture: options.lecture || null,

            editMode: false,
            folderId: null,
            originalName: "",
        });
    };

    const openEditFolderModal = (folder) => {
        if (!folder?.id) return;

        setCreateFolderModal({
            open: true,
            name: folder.name || "",
            selectAfterCreate: false,
            mode: null,
            lecture: null,

            editMode: true,
            folderId: folder.id,
            originalName: folder.name || "",
        });
    };

    const closeCreateFolderModal = () => {
        setCreateFolderModal({
            open: false,
            name: "",
            selectAfterCreate: false,
            mode: null,
            lecture: null,

            editMode: false,
            folderId: null,
            originalName: "",
        });
        setDeleteLectureModal({
            open: false,
            lecture: null,
        });
    };

    const submitCreateFolder = async () => {
        const cleanName = String(createFolderModal.name || "").trim();

        if (!cleanName) {
            showToast("폴더 이름을 입력해주세요.");
            return;
        }

        try {
            // 폴더 이름 수정
            if (createFolderModal.editMode) {
                const res = await fetch(`${API_BASE_URL}/api/folders/${createFolderModal.folderId}`, {
                    method: "PATCH",
                    headers: getAuthHeaders({ "Content-Type": "application/json" }),
                    body: JSON.stringify({ name: cleanName }),
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.message || "폴더 이름 수정 실패");
                }

                await fetchFolders();
                await fetchLectures();

                const oldName = createFolderModal.originalName;

                if (activeLectureFolder === oldName) {
                    setActiveLectureFolder(cleanName);
                }

                if (newLectureFolderName === oldName) {
                    setNewLectureFolderName(cleanName);
                }

                setSelectedLecture((prev) =>
                    prev?.folder_name === oldName
                        ? { ...prev, folder_name: cleanName }
                        : prev
                );

                closeCreateFolderModal();
                return;
            }

            // 새 폴더 생성
            const res = await fetch(`${API_BASE_URL}/api/folders`, {
                method: "POST",
                headers: getAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ name: cleanName }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || "폴더 생성 실패");
            }

            await fetchFolders();

            if (createFolderModal.selectAfterCreate) {
                if (createFolderModal.mode === "new") {
                    setNewLectureFolderName(cleanName);
                }

                if (createFolderModal.mode === "existing" && createFolderModal.lecture?.id) {
                    await moveLectureToFolder(createFolderModal.lecture.id, cleanName);
                }
            } else {
                setActiveLectureFolder(cleanName);
            }

            closeCreateFolderModal();
        } catch (err) {
            showToast(err.message || "폴더 처리 실패");
        }
    };

    const openDeleteFolderModal = (folder) => {
        if (!folder?.id) return;

        setDeleteFolderModal({
            open: true,
            folder,
        });
    };

    const closeDeleteFolderModal = () => {
        setDeleteFolderModal({
            open: false,
            folder: null,
        });
    };

    const submitDeleteFolder = async () => {
        const folder = deleteFolderModal.folder;
        if (!folder?.id) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/folders/${folder.id}`, {
                method: "DELETE",
                headers: getAuthHeaders(),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || "폴더 삭제 실패");
            }

            await fetchFolders();
            await fetchLectures();

            if (activeLectureFolder === folder.name) {
                setActiveLectureFolder("ALL");
            }

            if (newLectureFolderName === folder.name) {
                setNewLectureFolderName("");
            }

            setSelectedLecture((prev) =>
                prev?.folder_name === folder.name
                    ? { ...prev, folder_name: null }
                    : prev
            );

            closeDeleteFolderModal();
        } catch (err) {
            showToast(err.message || "폴더 삭제 실패");
        }
    };

    const moveLectureToFolder = async (lectureId, folderName) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/lectures/${lectureId}/folder`, {
                method: "PUT",
                headers: getAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ folderName: folderName || "" }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || "강의 폴더 변경 실패");
            }

            await fetchLectures();
            await fetchFolders();

            setSavedLectures((prev) =>
                prev.map((lecture) =>
                    String(lecture.id) === String(lectureId)
                        ? { ...lecture, folder_name: folderName || null }
                        : lecture
                )
            );

            setSelectedLecture((prev) =>
                prev && String(prev.id) === String(lectureId)
                    ? { ...prev, folder_name: folderName || null }
                    : prev
            );
        } catch (err) {
            showToast(err.message || "강의 폴더 변경 실패");
        }
    };

    const openFolderSelectForLecture = (lecture) => {
        if (!lecture?.id) return;

        setFolderPicker({
            open: true,
            mode: "existing",
            lecture,
        });
    };

    const openFolderSelectForNewLecture = () => {
        setCreateFolderModal({
            open: false,
            name: "",
            selectAfterCreate: false,
            mode: null,
            lecture: null,
            editMode: false,
            folderId: null,
            originalName: "",
        });

        setDeleteFolderModal({
            open: false,
            folder: null,
        });

        setFolderPicker({
            open: true,
            mode: "new",
            lecture: null,
        });
    };

    const closeFolderPicker = () => {
        setFolderPicker({
            open: false,
            mode: null,
            lecture: null,
        });
    };

    const handlePickFolder = async (folderName) => {
        // 새 강의 저장용 폴더 선택
        if (folderPicker.mode === "new") {
            setNewLectureFolderName(folderName || "");
            closeFolderPicker();
            return;
        }

        // 이미 저장된 강의 폴더 이동
        if (folderPicker.mode === "existing" && folderPicker.lecture?.id) {
            await moveLectureToFolder(folderPicker.lecture.id, folderName || "");
            closeFolderPicker();
        }
    };

    // 3초마다 이미지가 자동으로 넘어가게 하는 타이머
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentImgIndex((prev) => (prev + 1) % LANDING_IMAGES.length);
        }, 3000); // 3000ms = 3초
        return () => clearInterval(timer);
    }, [LANDING_IMAGES.length]);
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

    const showToast = (message) => {
        setToastMessage(message);

        setTimeout(() => {
            setToastMessage("");
        }, 2500);
    };

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

    const [friendSearchModal, setFriendSearchModal] = useState({
        open: false,
        keyword: "",
    });

    const [friendAddModal, setFriendAddModal] = useState({
        open: false,
        message: "",
    });

    const [groupCreateModal, setGroupCreateModal] = useState({
        open: false,
        roomName: "",
        selectedFriendIds: [],
        message: "",
    });

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


    const openFriendSearchModal = () => {
        setFriendSearchModal({
            open: true,
            keyword: "",
        });
    };

    const closeFriendSearchModal = () => {
        setFriendSearchModal({
            open: false,
            keyword: "",
        });
    };

    const openFriendAddModal = () => {
        setFriendEmail("");
        setFriendAddModal({
            open: true,
            message: "",
        });
    };

    const closeFriendAddModal = () => {
        setFriendEmail("");
        setFriendAddModal({
            open: false,
            message: "",
        });
    };

    const submitFriendAddRequest = async () => {
        const email = friendEmail.trim();

        if (!email) {
            setFriendAddModal((prev) => ({
                ...prev,
                message: "이메일을 입력해주세요.",
            }));
            return;
        }

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

            if (!res.ok) {
                throw new Error(data.message || "친구 요청 실패");
            }

            setFriendEmail("");

            setFriendAddModal({
                open: true,
                message: data.message || "친구 요청을 보냈습니다.",
            });

            await fetchSentFriendRequests();
        } catch (err) {
            setFriendAddModal((prev) => ({
                ...prev,
                message: err.message || "친구 요청 실패",
            }));
        }
    };

    const openGroupCreateModal = () => {
        setGroupCreateModal({
            open: true,
            roomName: "",
            selectedFriendIds: [],
            message: "",
        });
    };

    const closeGroupCreateModal = () => {
        setGroupCreateModal({
            open: false,
            roomName: "",
            selectedFriendIds: [],
            message: "",
        });
    };

    const toggleGroupFriend = (friendId) => {
        const id = String(friendId);

        setGroupCreateModal((prev) => {
            const alreadySelected = prev.selectedFriendIds.includes(id);

            return {
                ...prev,
                selectedFriendIds: alreadySelected
                    ? prev.selectedFriendIds.filter((item) => item !== id)
                    : [...prev.selectedFriendIds, id],
                message: "",
            };
        });
    };

    const submitCreateGroupRoom = async () => {
        if (!user?.user_id) return;

        const selectedFriends = friends.filter((friend) =>
            groupCreateModal.selectedFriendIds.includes(String(friend.user_id))
        );

        if (selectedFriends.length === 0) {
            setGroupCreateModal((prev) => ({
                ...prev,
                message: "단체방에 초대할 친구를 선택해주세요.",
            }));
            return;
        }

        const fallbackRoomName = selectedFriends
            .map((friend) => friend.name)
            .join(", ");

        const roomName = groupCreateModal.roomName.trim() || fallbackRoomName;

        const members = [
            ...groupCreateModal.selectedFriendIds,
            String(user.user_id),
        ];

        try {
            const res = await fetch(`${API_BASE_URL}/api/chat/rooms`, {
                method: "POST",
                headers: getAuthHeaders({
                    "Content-Type": "application/json",
                }),
                body: JSON.stringify({
                    roomName,
                    members,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || "단체방 생성 실패");
            }

            await fetchChatRooms();

            selectChatRoom(data.roomId, data.roomName || roomName);
            closeGroupCreateModal();
        } catch (err) {
            setGroupCreateModal((prev) => ({
                ...prev,
                message: err.message || "단체방 생성 실패",
            }));
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

            if (!res.ok) {
                throw new Error(data.message || "처리 실패");
            }

            showToast(data.message || "처리되었습니다.");

            await fetchFriendRequests();
            await fetchSentFriendRequests();
            await fetchFriends();
        } catch (err) {
            showToast(err.message || "처리 실패");
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

    const handleLeaveGroupRoom = async (e, roomId) => {
        e.stopPropagation();
        if (!window.confirm("이 단체 채팅방에서 나가시겠습니까?")) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/chat/rooms/leave`, {
                method: 'DELETE',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ roomId })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "방 나가기 실패");

            showToast("채팅방에서 나갔습니다.");
            if (currentRoomId === roomId) resetChatSelection();
            fetchChatRooms();
        } catch (err) {
            showToast(err.message);
        }
    };

    const resetChatSelection = () => {
        setCurrentRoomId(null);
        setActiveChatTitle(null);
        setChatInput("");
    };

    // 강의 공유
    const [shareModal, setShareModal] = useState(null);
    const [shareTargetRoom, setShareTargetRoom] = useState("");
    const [lectureSummaryModal, setLectureSummaryModal] = useState(null);

    function openShareModal(lecture) {
        setShareModal({ lecture });
        setShareTargetRoom("");
    }

    function handleShareLecture() {
        if (!shareModal || !shareTargetRoom || !user) return;
        const { lecture } = shareModal;

        const sharePayload = {
            type: "lecture_share",
            lecture_id: lecture.id,
            title: lecture.title || "제목 없음",
            summary: lecture.summary || "",
            keywords: (lecture.keywords || []).slice(0, 5),
        };

        const client_temp_id = `${user.user_id}_${Date.now()}_share`;

        socket.emit("send_message", {
            roomId: shareTargetRoom,
            text: JSON.stringify(sharePayload),
            client_temp_id,
        });

        setShareModal(null);
        showToast("강의를 공유했습니다!");
    }


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

    // 1. 메시지 및 알림 처리 함수를 useCallback으로 메모리에 고정하여 중복 등록 방지
    const handleMessage = useCallback((data) => {
        const roomKey = data.roomId ?? data.room_id;

        setMessages((prev) => {
            const prevMsgs = prev[roomKey] || [];
            // 메시지 자체 중복 체크 (ID 기준)[cite: 8]
            if (prevMsgs.some(m => (m.id && m.id === data.id) || (m.client_temp_id && m.client_temp_id === data.client_temp_id))) {
                return prev;
            }
            return { ...prev, [roomKey]: [...prevMsgs, data] };
        });

        // 사용자가 현재 해당 채팅방을 보고 있지 않을 때만 알림 생성[cite: 8]
        if (window.currentActiveTab !== "chat" || String(roomKey) !== String(window.currentChatRoomId)) {
            const messageText = data.text ?? data.message ?? "";
            const messageKey = String(
                data.client_temp_id ||
                data.id ||
                data.message_id ||
                `${roomKey}_${data.sender_id}_${messageText}`
            );

            setNotifications(prev => {
                const exists = prev.some(n => n.messageKey === messageKey);
                if (exists) return prev;

                return [
                    {
                        id: messageKey,
                        messageKey,
                        message: `💬 ${data.sender_name}님이 채팅을 보냈습니다.`,
                        link: "chat",
                        roomId: roomKey,
                        senderId: data.sender_id,
                        roomName: data.sender_name,
                        type: "chat"
                    },
                    ...prev
                ];
            });

        }
    }, []);

    const handleNotification = useCallback((data) => {
        if (data?.type === "chat" || data?.roomId || data?.room_id) return;
        let icon = "🔔 ";
        let targetTab = "home";

        if (data.type === "friend_request") {
            icon = "👤 ";
            targetTab = "chat";
        } else if (data.type === "friend_accepted") {
            icon = "✅ ";
            targetTab = "chat";
        } else if (data.type === "friend_rejected") {
            icon = "❌ ";
            targetTab = "chat";
        }

        setNotifications(prev => [
            {
                id: Date.now() + Math.random(),
                message: icon + data.message,
                link: targetTab,
                type: data.type
            },
            ...prev
        ]);

        if (["friend_request", "friend_accepted", "friend_rejected"].includes(data?.type)) {
            fetchFriendRequests();
            fetchSentFriendRequests();
            fetchFriends();
        }
    }, []);

    // 2. 소켓 연결 및 리스너 등록/제거 통합 관리
    useEffect(() => {
        // 1. 로그아웃 상태면 소켓 연결 해제
        if (!user?.user_id) {
            if (socket.connected) socket.disconnect();
            return;
        }

        // 2. 소켓 연결 설정
        if (!socket.connected) {
            socket.auth = { token: localStorage.getItem("token") };
            socket.connect();
        }

        // 3. 중복 등록 방지를 위해 기존 리스너 전체 제거 (가장 확실한 방법)
        socket.removeAllListeners("receive_message");
        socket.removeAllListeners("new_notification");

        // 4. 리스너 재등록
        socket.emit("join_self");
        socket.on("receive_message", handleMessage);
        socket.on("new_notification", handleNotification);

        // 5. 클린업 함수
        return () => {
            socket.off("receive_message", handleMessage);
            socket.off("new_notification", handleNotification);
        };
    }, [user?.user_id]);

    useEffect(() => {
        window.currentActiveTab = activeTab;
        window.currentChatRoomId = currentRoomId;
        if (socket.connected && currentRoomId) {
            socket.emit("join_room", currentRoomId);
        }
    }, [activeTab, currentRoomId]);

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

            setAuthMessage("📩 인증 메일이 발송되었습니다! 입력하신 메일함에서 '인증하기' 버튼을 눌러야 로그인이 가능합니다.");

            setAuthMode("login");
            setAuthForm({ name: "", email: authForm.email, password: "" });
            setShowResendButton(false);
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
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: authForm.email,
                    password: authForm.password,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || "로그인 실패");
            }

            // 로그인 성공 시 로직
            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));
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
        if (!authForm.email) return showToast("이메일을 입력해주세요.");
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
        localStorage.removeItem("unread_notifications");

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
        setFriendSearchModal({
            open: false,
            keyword: "",
        });

        setFriendAddModal({
            open: false,
            message: "",
        });

        setGroupCreateModal({
            open: false,
            roomName: "",
            selectedFriendIds: [],
            message: "",
        });
        setFolders([]);
        setActiveLectureFolder("ALL");
        setNewLectureFolderName("");
        setCreateFolderModal({
            open: false,
            name: "",
            selectAfterCreate: false,
            mode: null,
            lecture: null,
        });
    }

    async function handleGenerateSummary() {
        const hasTitle = lectureTitle.trim();
        const hasText = lectureText.trim();
        const hasFiles = lectureFiles.length > 0;

        if (!hasTitle) {
            setLectureMessage("강의 제목을 입력해주세요.");
            return;
        }

        if (!hasText && !hasFiles) {
            setLectureMessage("강의 내용이나 파일을 넣어주세요.");
            return;
        }

        setIsSummarizing(true);
        setLectureMessage(
            hasFiles
                ? "AI가 강의 파일과 내용을 분석 중..."
                : "AI가 요약 중..."
        );

        try {
            const formData = new FormData();

            formData.append("text", lectureText || "");
            formData.append("sourceLang", sourceLang);
            formData.append("quizCount", String(quizCount));
            formData.append("quizDifficulty", quizDifficulty);
            formData.append("quizTypes", JSON.stringify(quizTypes));

            lectureFiles.forEach((file) => {
                formData.append("files", file);
            });

            const res = await fetch(`${API_BASE_URL}/api/summarize`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || "요약 생성 실패. 파일이 스캔본이거나 텍스트 추출이 어려운 형식일 수 있습니다.");
            }

            const nextLectureText = [
                lectureText.trim(),
                data.extractedText ? `첨부파일 추출 내용:\n${data.extractedText}` : "",
            ]
                .filter(Boolean)
                .join("\n\n");

            setLectureText(nextLectureText);
            setSummary(data.summary || "");
            setKeywords(Array.isArray(data.keywords) ? data.keywords : []);
            setKeywordExplanations(data.keywordExplanations || {});
            setQuiz(Array.isArray(data.quiz) ? data.quiz.map(normalizeQuizItem) : []);

            setSubjectType(data.subjectType || "general");
            setAnalysisTitle(data.analysisTitle || "");
            setStudyGuide(data.studyGuide || {
                coreConcepts: [],
                codeHighlights: [],
                formulas: [],
                problemSolvingSteps: [],
                examPoints: [],
                commonMistakes: [],
                practiceTasks: [],
            });

            setLectureMessage("AI 요약 생성 완료 ✅");
        } catch (error) {
            setLectureMessage(error.message || "요약 생성 중 오류 발생");
        } finally {
            setIsSummarizing(false);
        }
    }


    async function handleSaveLecture() {
        if (!lectureTitle.trim()) {
            showToast("제목을 입력하세요.");
            return;
        }

        if (!lectureText.trim() && lectureFiles.length === 0) {
            showToast("강의 내용이나 파일을 넣어주세요.");
            return;
        }

        try {
            const formData = new FormData();

            formData.append("title", lectureTitle);
            formData.append("raw_text", lectureText);

            if (newLectureFolderName) {
                formData.append("folderName", newLectureFolderName);
            }

            formData.append(
                "summary_data",
                JSON.stringify({
                    subjectType,
                    analysisTitle,
                    summary,
                    keywords,
                    keywordExplanations,
                    studyGuide,
                    quiz: quiz.map(normalizeQuizItem),
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

            showToast("강의 저장 완료!");

            await fetchLectures();
            await fetchFolders();

            setLectureTitle("");
            setLectureText("");
            setSummary("");
            setKeywords([]);
            setQuiz([]);
            setLectureFiles([]);
            setNewLectureFolderName("");

            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        } catch (err) {
            console.error(err);
            showToast(err.message || "저장 중 오류 발생");
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
        setSubjectType(lecture.subjectType || "general");
        setAnalysisTitle(lecture.analysisTitle || "");
        setStudyGuide(lecture.studyGuide || {
            coreConcepts: [],
            codeHighlights: [],
            formulas: [],
            problemSolvingSteps: [],
            examPoints: [],
            commonMistakes: [],
            practiceTasks: [],
        });

        setAnswers({});
        setSubmitted({});
        setGradeResults({});
        setGrading({});
        setIsEditMode(false);
        setLectureMessage("저장된 강의를 불러왔습니다.");
    }

    const openDeleteLectureModal = (e, lecture) => {
        if (e) e.stopPropagation();
        if (!lecture?.id) return;

        setDeleteLectureModal({
            open: true,
            lecture,
        });
    };

    const closeDeleteLectureModal = () => {
        setDeleteLectureModal({
            open: false,
            lecture: null,
        });
    };

    const submitDeleteLecture = async () => {
        const lecture = deleteLectureModal.lecture;
        if (!lecture?.id) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/lectures/${lecture.id}`, {
                method: "DELETE",
                headers: getAuthHeaders(),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || "강의 삭제 실패");
            }

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
                setSubjectType("general");
                setAnalysisTitle("");
                setStudyGuide({
                    coreConcepts: [],
                    codeHighlights: [],
                    formulas: [],
                    problemSolvingSteps: [],
                    examPoints: [],
                    commonMistakes: [],
                    practiceTasks: [],
                });
            }

            setLectureMessage("강의가 삭제되었습니다.");
            await fetchLectures();
            await fetchFolders();

            closeDeleteLectureModal();
        } catch (error) {
            setLectureMessage(error.message || "강의 삭제 중 오류가 발생했습니다.");
        }
    };

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
                    subjectType,
                    analysisTitle,
                    summary,
                    keywords,
                    keywordExplanations,
                    studyGuide,
                    quiz: quiz.map(normalizeQuizItem),
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

            showToast("수정 완료!");

            await fetchLectures();
        } catch (err) {
            showToast("수정 실패");
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

    async function initiateRecording() {
        const token = localStorage.getItem("token");
        if (!token) {
            showToast("로그인이 필요합니다.");
            return;
        }

        // 기존 내용 유지 여부 확인
        if (liveTranscriptRef.current.trim().length > 0) {
            setShowAppendAsk(true);
        } else {
            // 기존 내용이 없으면 바로 장치 선택창으로 이동
            setShowRecordingChoice(true);
        }
    }

    // '새로 시작' 혹은 '이어하기' 선택 후 처리 함수
    const handleAppendChoice = (shouldAppend) => {
        setShowAppendAsk(false);
        if (!shouldAppend) {
            setLectureText("");
            setLiveTranscript("");
            liveTranscriptRef.current = "";
        }
        setShowRecordingChoice(true); // 어떤 선택을 하든 장치 선택창으로 넘어감
    };

    async function executeStartRecording(isSystemAudio) {
        setShowRecordingChoice(false);

        try {
            let stream;
            if (isSystemAudio) {
                stream = await navigator.mediaDevices.getDisplayMedia({
                    video: { displaySurface: "browser" },
                    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
                });
                const audioTrack = stream.getAudioTracks()[0];
                if (!audioTrack) {
                    showToast("⚠️ '시스템 오디오 공유'를 체크해야 소리가 녹음됩니다!");
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
            setLectureMessage(`녹음 취소`);
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
        if (!socket.connected) {
            showToast("연결이 끊겼습니다. 새로고침 해주세요.");
            return;
        }
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
            showToast("강의 내용이 없습니다. 강의를 먼저 선택하거나 입력해주세요.");
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
            setQuiz(Array.isArray(data.quiz) ? data.quiz.map(normalizeQuizItem) : []);
            setAnswers({});
            setSubmitted({});
            setGradeResults({});
            setGrading({});
            quizHistorySavedRef.current = false;
        } catch (err) {
            showToast(err.message || "퀴즈 생성 중 오류가 발생했습니다.");
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

        // 모든 강의면 전체 표시
        // 특정 폴더를 누른 경우에만 그 폴더에 들어간 강의만 표시
        if (activeLectureFolder !== "ALL") {
            list = list.filter((lecture) => lecture.folder_name === activeLectureFolder);
        }

        if (lectureSearch.trim()) {
            const q = lectureSearch.trim().toLowerCase();

            list = list.filter(
                (lecture) =>
                    String(lecture.title || "").toLowerCase().includes(q) ||
                    String(lecture.raw_text || "").toLowerCase().includes(q) ||
                    (Array.isArray(lecture.keywords) &&
                        lecture.keywords.some((keyword) =>
                            String(keyword || "").toLowerCase().includes(q)
                        ))
            );
        }

        list.sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;

            return lectureSortOrder === "newest" ? dateB - dateA : dateA - dateB;
        });

        return list;
    }, [savedLectures, activeLectureFolder, lectureSearch, lectureSortOrder]);


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
                            {LANDING_IMAGES.map((img, idx) => (
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

            {toastMessage && (
                <div
                    className="appToast"
                    style={{
                        position: "fixed",
                        top: 24,
                        left: "50%",
                        transform: "translateX(-50%)",
                        zIndex: 20000,
                        background: "#111827",
                        color: "#fff",
                        padding: "12px 18px",
                        borderRadius: 999,
                        boxShadow: "0 16px 40px rgba(15, 23, 42, 0.25)",
                        fontWeight: 800,
                        fontSize: 14,
                        animation: "toastFadeIn 0.2s ease-out",
                    }}
                >
                    {toastMessage}
                </div>
            )}

            {folderPicker.open && (
                <div
                    className="appModalOverlay"
                    onClick={closeFolderPicker}
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(15, 23, 42, 0.45)",
                        zIndex: 9999,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 20,
                    }}
                >
                    <div
                        className="appModalPanel"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: "100%",
                            maxWidth: 420,
                            background: "#fff",
                            borderRadius: 24,
                            padding: 24,
                            boxShadow: "0 24px 80px rgba(15, 23, 42, 0.25)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: 18,
                            }}
                        >
                            <div>
                                <h2 style={{ margin: 0, fontSize: 22 }}>
                                    폴더 선택
                                </h2>
                                <p
                                    style={{
                                        margin: "6px 0 0",
                                        color: "#64748b",
                                        fontSize: 14,
                                    }}
                                >
                                    {folderPicker.mode === "new"
                                        ? "새 강의를 넣을 폴더를 선택하세요."
                                        : "이 강의를 넣을 폴더를 선택하세요."}
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={closeFolderPicker}
                                style={{
                                    border: "none",
                                    background: "#f1f5f9",
                                    width: 36,
                                    height: 36,
                                    borderRadius: 999,
                                    cursor: "pointer",
                                    fontSize: 18,
                                }}
                            >
                                ×
                            </button>
                        </div>

                        {folders.length === 0 ? (
                            <div
                                className="appModalInfoBox"
                                style={{
                                    padding: 20,
                                    borderRadius: 16,
                                    background: "#f8fafc",
                                    color: "#64748b",
                                    textAlign: "center",
                                    marginBottom: 14,
                                }}
                            >
                                아직 만든 폴더가 없습니다.
                            </div>
                        ) : (
                            <div
                                style={{
                                    display: "grid",
                                    gap: 10,
                                    marginBottom: 14,
                                }}
                            >
                                {folders.map((folder) => {
                                    const isSelected =
                                        folderPicker.mode === "new"
                                            ? newLectureFolderName === folder.name
                                            : folderPicker.lecture?.folder_name === folder.name;

                                    return (
                                        <button
                                            key={folder.id || folder.name}
                                            type="button"
                                            className={isSelected ? "appModalOption appModalOptionSelected" : "appModalOption"}
                                            onClick={() => handlePickFolder(folder.name)}
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                                width: "100%",
                                                padding: "14px 16px",
                                                borderRadius: 16,
                                                border: isSelected
                                                    ? "2px solid #4f46e5"
                                                    : "1px solid #e2e8f0",
                                                background: isSelected ? "#eef2ff" : "#fff",
                                                cursor: "pointer",
                                                fontWeight: 700,
                                                fontSize: 15,
                                                color: "#0f172a",
                                            }}
                                        >
                                            <span>📁 {folder.name}</span>
                                            <span
                                                style={{
                                                    color: isSelected ? "#4f46e5" : "#94a3b8",
                                                    fontSize: 13,
                                                }}
                                            >
                                                {isSelected ? "선택됨" : "선택"}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        <div
                            style={{
                                display: "flex",
                                gap: 10,
                                marginTop: 12,
                            }}
                        >
                            <button
                                type="button"
                                className="secondaryBtn"
                                onClick={() => handlePickFolder("")}
                                style={{ flex: 1 }}
                            >
                                폴더 없이 저장
                            </button>

                            <button
                                type="button"
                                className="primaryBtn"
                                onClick={() => {
                                    const currentMode = folderPicker.mode;
                                    const currentLecture = folderPicker.lecture;

                                    closeFolderPicker();

                                    handleCreateFolder({
                                        selectAfterCreate: true,
                                        mode: currentMode,
                                        lecture: currentLecture,
                                    });
                                }}
                                style={{ flex: 1 }}
                            >
                                + 새 폴더 만들기
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {createFolderModal.open && (
                <div
                    className="appModalOverlay"
                    onClick={closeCreateFolderModal}
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(15, 23, 42, 0.45)",
                        zIndex: 10000,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 20,
                    }}
                >
                    <div
                        className="appModalPanel"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: "100%",
                            maxWidth: 420,
                            background: "#fff",
                            borderRadius: 24,
                            padding: 24,
                            boxShadow: "0 24px 80px rgba(15, 23, 42, 0.25)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: 18,
                            }}
                        >
                            <div>
                                <h2 style={{ margin: 0, fontSize: 22 }}>
                                    {createFolderModal.editMode ? "폴더 이름 수정" : "새 폴더 만들기"}
                                </h2>

                                <p
                                    style={{
                                        margin: "6px 0 0",
                                        color: "#64748b",
                                        fontSize: 14,
                                    }}
                                >
                                    {createFolderModal.editMode
                                        ? "새로운 폴더 이름을 입력하세요."
                                        : "강의를 정리할 폴더 이름을 입력하세요."}
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={closeCreateFolderModal}
                                style={{
                                    border: "none",
                                    background: "#f1f5f9",
                                    width: 36,
                                    height: 36,
                                    borderRadius: 999,
                                    cursor: "pointer",
                                    fontSize: 18,
                                }}
                            >
                                ×
                            </button>
                        </div>

                        <input
                            className="input"
                            autoFocus
                            value={createFolderModal.name}
                            onChange={(e) =>
                                setCreateFolderModal((prev) => ({
                                    ...prev,
                                    name: e.target.value,
                                }))
                            }
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    submitCreateFolder();
                                }

                                if (e.key === "Escape") {
                                    closeCreateFolderModal();
                                }
                            }}
                            placeholder="예: 2026-1, 영어, 자료구조"
                            style={{
                                width: "100%",
                                marginBottom: 16,
                                fontSize: 15,
                            }}
                        />

                        <div
                            style={{
                                display: "flex",
                                gap: 10,
                            }}
                        >
                            <button
                                type="button"
                                className="secondaryBtn"
                                onClick={closeCreateFolderModal}
                                style={{ flex: 1 }}
                            >
                                취소
                            </button>

                            <button
                                type="button"
                                className="primaryBtn"
                                onClick={submitCreateFolder}
                                style={{ flex: 1 }}
                            >
                                {createFolderModal.editMode ? "수정하기" : "만들기"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteFolderModal.open && (
                <div
                    className="appModalOverlay"
                    onClick={closeDeleteFolderModal}
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(15, 23, 42, 0.45)",
                        zIndex: 10000,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 20,
                    }}
                >
                    <div
                        className="appModalPanel"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: "100%",
                            maxWidth: 420,
                            background: "#fff",
                            borderRadius: 24,
                            padding: 24,
                            boxShadow: "0 24px 80px rgba(15, 23, 42, 0.25)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: 18,
                            }}
                        >
                            <div>
                                <h2 style={{ margin: 0, fontSize: 22 }}>
                                    폴더 삭제
                                </h2>

                                <p
                                    style={{
                                        margin: "6px 0 0",
                                        color: "#64748b",
                                        fontSize: 14,
                                    }}
                                >
                                    이 폴더를 삭제하시겠습니까?
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={closeDeleteFolderModal}
                                style={{
                                    border: "none",
                                    background: "#f1f5f9",
                                    width: 36,
                                    height: 36,
                                    borderRadius: 999,
                                    cursor: "pointer",
                                    fontSize: 18,
                                }}
                            >
                                ×
                            </button>
                        </div>

                        <div
                            className="appModalInfoBox"
                            style={{
                                padding: 16,
                                borderRadius: 16,
                                background: "#f8fafc",
                                border: "1px solid #e2e8f0",
                                marginBottom: 16,
                            }}
                        >
                            <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>
                                📁 {deleteFolderModal.folder?.name}
                            </div>

                            <div style={{ color: "#64748b", fontSize: 14, lineHeight: 1.5 }}>
                                폴더만 삭제되고 안에 있던 강의는 삭제되지 않습니다.
                                삭제 후 강의는 모든 강의에서 계속 볼 수 있습니다.
                            </div>
                        </div>

                        <div
                            style={{
                                display: "flex",
                                gap: 10,
                            }}
                        >
                            <button
                                type="button"
                                className="secondaryBtn"
                                onClick={closeDeleteFolderModal}
                                style={{ flex: 1 }}
                            >
                                취소
                            </button>

                            <button
                                type="button"
                                onClick={submitDeleteFolder}
                                style={{
                                    flex: 1,
                                    border: "none",
                                    borderRadius: 14,
                                    padding: "12px 16px",
                                    cursor: "pointer",
                                    fontWeight: 800,
                                    background: "#ef4444",
                                    color: "#fff",
                                }}
                            >
                                삭제하기
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteLectureModal.open && (
                <div
                    className="appModalOverlay"
                    onClick={closeDeleteLectureModal}
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(15, 23, 42, 0.45)",
                        zIndex: 10000,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 20,
                    }}
                >
                    <div
                        className="appModalPanel"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: "100%",
                            maxWidth: 420,
                            background: "#fff",
                            borderRadius: 24,
                            padding: 24,
                            boxShadow: "0 24px 80px rgba(15, 23, 42, 0.25)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: 18,
                            }}
                        >
                            <div>
                                <h2 style={{ margin: 0, fontSize: 22 }}>
                                    강의 삭제
                                </h2>

                                <p
                                    style={{
                                        margin: "6px 0 0",
                                        color: "#64748b",
                                        fontSize: 14,
                                    }}
                                >
                                    이 강의를 삭제하시겠습니까?
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={closeDeleteLectureModal}
                                style={{
                                    border: "none",
                                    background: "#f1f5f9",
                                    width: 36,
                                    height: 36,
                                    borderRadius: 999,
                                    cursor: "pointer",
                                    fontSize: 18,
                                }}
                            >
                                ×
                            </button>
                        </div>

                        <div
                            className="appModalInfoBox"
                            style={{
                                padding: 16,
                                borderRadius: 16,
                                background: "#f8fafc",
                                border: "1px solid #e2e8f0",
                                marginBottom: 16,
                            }}
                        >
                            <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>
                                📘 {deleteLectureModal.lecture?.title || "제목 없음"}
                            </div>

                            <div style={{ color: "#64748b", fontSize: 14, lineHeight: 1.5 }}>
                                삭제한 강의는 복구할 수 없습니다.
                                첨부 파일과 요약, 키워드, 퀴즈 정보도 함께 삭제됩니다.
                            </div>
                        </div>

                        <div
                            style={{
                                display: "flex",
                                gap: 10,
                            }}
                        >
                            <button
                                type="button"
                                className="secondaryBtn"
                                onClick={closeDeleteLectureModal}
                                style={{ flex: 1 }}
                            >
                                취소
                            </button>

                            <button
                                type="button"
                                onClick={submitDeleteLecture}
                                style={{
                                    flex: 1,
                                    border: "none",
                                    borderRadius: 14,
                                    padding: "12px 16px",
                                    cursor: "pointer",
                                    fontWeight: 800,
                                    background: "#ef4444",
                                    color: "#fff",
                                }}
                            >
                                삭제하기
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {friendSearchModal.open && (
                <div
                    className="appModalOverlay"
                    onClick={closeFriendSearchModal}
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(15, 23, 42, 0.45)",
                        zIndex: 10000,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 20,
                    }}
                >
                    <div
                        className="appModalPanel"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: "100%",
                            maxWidth: 460,
                            background: "#fff",
                            borderRadius: 24,
                            padding: 24,
                            boxShadow: "0 24px 80px rgba(15, 23, 42, 0.25)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: 18,
                            }}
                        >
                            <div>
                                <h2 style={{ margin: 0, fontSize: 22 }}>
                                    내 친구 검색
                                </h2>

                                <p
                                    style={{
                                        margin: "6px 0 0",
                                        color: "#64748b",
                                        fontSize: 14,
                                    }}
                                >
                                    내 친구 목록에서 이름이나 이메일로 검색하세요.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={closeFriendSearchModal}
                                style={{
                                    border: "none",
                                    background: "#f1f5f9",
                                    width: 36,
                                    height: 36,
                                    borderRadius: 999,
                                    cursor: "pointer",
                                    fontSize: 18,
                                }}
                            >
                                ×
                            </button>
                        </div>

                        <input
                            className="input"
                            autoFocus
                            value={friendSearchModal.keyword}
                            onChange={(e) =>
                                setFriendSearchModal((prev) => ({
                                    ...prev,
                                    keyword: e.target.value,
                                }))
                            }
                            onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                    closeFriendSearchModal();
                                }
                            }}
                            placeholder="친구 이름 또는 이메일 검색"
                            style={{
                                width: "100%",
                                marginBottom: 14,
                                fontSize: 15,
                            }}
                        />

                        {(() => {
                            const q = friendSearchModal.keyword.trim().toLowerCase();

                            const filteredFriends = friends.filter((friend) => {
                                const name = String(friend.name || "").toLowerCase();
                                const email = String(friend.email || "").toLowerCase();

                                if (!q) return true;

                                return name.includes(q) || email.includes(q);
                            });

                            if (friends.length === 0) {
                                return (
                                    <div
                                        className="appModalInfoBox"
                                        style={{
                                            padding: 18,
                                            borderRadius: 16,
                                            background: "#f8fafc",
                                            border: "1px solid #e2e8f0",
                                            color: "#64748b",
                                            textAlign: "center",
                                            marginBottom: 14,
                                        }}
                                    >
                                        아직 친구가 없습니다.
                                    </div>
                                );
                            }

                            if (filteredFriends.length === 0) {
                                return (
                                    <div
                                        className="appModalInfoBox"
                                        style={{
                                            padding: 18,
                                            borderRadius: 16,
                                            background: "#f8fafc",
                                            border: "1px solid #e2e8f0",
                                            color: "#64748b",
                                            textAlign: "center",
                                            marginBottom: 14,
                                        }}
                                    >
                                        검색 결과가 없습니다.
                                    </div>
                                );
                            }

                            return (
                                <div
                                    style={{
                                        display: "grid",
                                        gap: 10,
                                        maxHeight: 320,
                                        overflowY: "auto",
                                        marginBottom: 14,
                                    }}
                                >
                                    {filteredFriends.map((friend) => (
                                        <button
                                            key={friend.user_id}
                                            type="button"
                                            className="appModalOption"
                                            onClick={() => {
                                                enterPrivateChat(friend);
                                                closeFriendSearchModal();
                                            }}
                                            style={{
                                                width: "100%",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 12,
                                                padding: "14px 16px",
                                                borderRadius: 16,
                                                border: "1px solid #e2e8f0",
                                                background: "#fff",
                                                cursor: "pointer",
                                                textAlign: "left",
                                            }}
                                        >
                                            <div
                                                className="friendSearchAvatar"
                                                style={{
                                                    width: 42,
                                                    height: 42,
                                                    borderRadius: 999,
                                                    background: "#eef2ff",
                                                    color: "#4f46e5",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    fontWeight: 900,
                                                    flexShrink: 0,
                                                }}
                                            >
                                                {String(friend.name || "?").slice(0, 1)}
                                            </div>

                                            <div style={{ minWidth: 0 }}>
                                                <div
                                                    className="friendSearchName"
                                                    style={{
                                                        fontWeight: 800,
                                                        color: "#0f172a",
                                                        marginBottom: 4,
                                                    }}
                                                >
                                                    {friend.name}
                                                </div>

                                                <div
                                                    className="friendSearchEmail"
                                                    style={{
                                                        color: "#64748b",
                                                        fontSize: 12,
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        whiteSpace: "nowrap",
                                                    }}
                                                >
                                                    {friend.email}
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            );
                        })()}

                        <button
                            type="button"
                            className="secondaryBtn"
                            onClick={closeFriendSearchModal}
                            style={{ width: "100%" }}
                        >
                            닫기
                        </button>
                    </div>
                </div>
            )}

            {friendAddModal.open && (
                <div
                    className="appModalOverlay"
                    onClick={closeFriendAddModal}
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(15, 23, 42, 0.45)",
                        zIndex: 10000,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 20,
                    }}
                >
                    <div
                        className="appModalPanel"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: "100%",
                            maxWidth: 420,
                            background: "#fff",
                            borderRadius: 24,
                            padding: 24,
                            boxShadow: "0 24px 80px rgba(15, 23, 42, 0.25)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: 18,
                            }}
                        >
                            <div>
                                <h2 style={{ margin: 0, fontSize: 22 }}>
                                    친구 추가
                                </h2>

                                <p
                                    style={{
                                        margin: "6px 0 0",
                                        color: "#64748b",
                                        fontSize: 14,
                                    }}
                                >
                                    이메일로 친구 요청을 보낼 수 있습니다.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={closeFriendAddModal}
                                style={{
                                    border: "none",
                                    background: "#f1f5f9",
                                    width: 36,
                                    height: 36,
                                    borderRadius: 999,
                                    cursor: "pointer",
                                    fontSize: 18,
                                }}
                            >
                                ×
                            </button>
                        </div>

                        <input
                            className="input"
                            autoFocus
                            value={friendEmail}
                            onChange={(e) => setFriendEmail(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    submitFriendAddRequest();
                                }

                                if (e.key === "Escape") {
                                    closeFriendAddModal();
                                }
                            }}
                            placeholder="친구 이메일을 입력하세요"
                            style={{
                                width: "100%",
                                marginBottom: 12,
                                fontSize: 15,
                            }}
                        />

                        {friendAddModal.message && (
                            <div
                                className="appModalInfoBox"

                                style={{
                                    padding: 12,
                                    borderRadius: 14,
                                    background: "#f8fafc",
                                    border: "1px solid #e2e8f0",
                                    color: "#334155",
                                    fontSize: 14,
                                    marginBottom: 14,
                                }}
                            >
                                {friendAddModal.message}
                            </div>
                        )}

                        <div
                            style={{
                                display: "flex",
                                gap: 10,
                            }}
                        >
                            <button
                                type="button"
                                className="secondaryBtn"
                                onClick={closeFriendAddModal}
                                style={{ flex: 1 }}
                            >
                                닫기
                            </button>

                            <button
                                type="button"
                                className="primaryBtn"
                                onClick={submitFriendAddRequest}
                                style={{ flex: 1 }}
                            >
                                친구 요청
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {groupCreateModal.open && (
                <div
                    className="appModalOverlay"
                    onClick={closeGroupCreateModal}
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(15, 23, 42, 0.45)",
                        zIndex: 10000,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 20,
                    }}
                >
                    <div
                        className="appModalPanel"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: "100%",
                            maxWidth: 480,
                            background: "#fff",
                            borderRadius: 24,
                            padding: 24,
                            boxShadow: "0 24px 80px rgba(15, 23, 42, 0.25)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: 18,
                            }}
                        >
                            <div>
                                <h2 style={{ margin: 0, fontSize: 22 }}>
                                    단체방 만들기
                                </h2>

                                <p
                                    style={{
                                        margin: "6px 0 0",
                                        color: "#64748b",
                                        fontSize: 14,
                                    }}
                                >
                                    친구를 선택하고 단체방 이름을 설정하세요.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={closeGroupCreateModal}
                                style={{
                                    border: "none",
                                    background: "#f1f5f9",
                                    width: 36,
                                    height: 36,
                                    borderRadius: 999,
                                    cursor: "pointer",
                                    fontSize: 18,
                                }}
                            >
                                ×
                            </button>
                        </div>

                        <input
                            className="input"
                            value={groupCreateModal.roomName}
                            onChange={(e) =>
                                setGroupCreateModal((prev) => ({
                                    ...prev,
                                    roomName: e.target.value,
                                    message: "",
                                }))
                            }
                            placeholder="단체방 이름, 비워두면 친구 이름으로 생성"
                            style={{
                                width: "100%",
                                marginBottom: 14,
                                fontSize: 15,
                            }}
                        />

                        <div
                            className="appModalTitle"
                            style={{
                                fontWeight: 800,
                                marginBottom: 10,
                            }}
                        >
                            초대할 친구 선택
                        </div>

                        {friends.length === 0 ? (
                            <div
                                className="appModalInfoBox"
                                style={{
                                    padding: 18,
                                    borderRadius: 16,
                                    background: "#f8fafc",
                                    border: "1px solid #e2e8f0",
                                    color: "#64748b",
                                    textAlign: "center",
                                    marginBottom: 14,
                                }}
                            >
                                선택할 친구가 없습니다.
                            </div>
                        ) : (
                            <div
                                style={{
                                    display: "grid",
                                    gap: 10,
                                    maxHeight: 260,
                                    overflowY: "auto",
                                    marginBottom: 14,
                                }}
                            >
                                {friends.map((friend) => {
                                    const selected = groupCreateModal.selectedFriendIds.includes(
                                        String(friend.user_id)
                                    );

                                    return (
                                        <button
                                            key={friend.user_id}
                                            type="button"
                                            className={selected ? "appModalOption appModalOptionSelected" : "appModalOption"}
                                            onClick={() => toggleGroupFriend(friend.user_id)}
                                            style={{
                                                width: "100%",
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                                padding: "14px 16px",
                                                borderRadius: 16,
                                                border: selected
                                                    ? "2px solid #4f46e5"
                                                    : "1px solid #e2e8f0",
                                                background: selected ? "#eef2ff" : "#fff",
                                                cursor: "pointer",
                                                textAlign: "left",
                                            }}
                                        >
                                            <div>
                                                <div
                                                    style={{
                                                        fontWeight: 800,
                                                        color: "#0f172a",
                                                    }}
                                                >
                                                    👤 {friend.name}
                                                </div>

                                                <div
                                                    style={{
                                                        color: "#64748b",
                                                        fontSize: 12,
                                                        marginTop: 4,
                                                    }}
                                                >
                                                    {friend.email}
                                                </div>
                                            </div>

                                            <div
                                                style={{
                                                    color: selected ? "#4f46e5" : "#94a3b8",
                                                    fontWeight: 800,
                                                    fontSize: 13,
                                                }}
                                            >
                                                {selected ? "선택됨" : "선택"}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {groupCreateModal.message && (
                            <div
                                className="appModalInfoBox"
                                style={{
                                    padding: 12,
                                    borderRadius: 14,
                                    background: "#fef2f2",
                                    border: "1px solid #fecaca",
                                    color: "#dc2626",
                                    fontSize: 14,
                                    marginBottom: 14,
                                }}
                            >
                                {groupCreateModal.message}
                            </div>
                        )}

                        <div
                            style={{
                                display: "flex",
                                gap: 10,
                            }}
                        >
                            <button
                                type="button"
                                className="secondaryBtn"
                                onClick={closeGroupCreateModal}
                                style={{ flex: 1 }}
                            >
                                취소
                            </button>

                            <button
                                type="button"
                                className="primaryBtn"
                                onClick={submitCreateGroupRoom}
                                style={{ flex: 1 }}
                            >
                                생성하기
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                        👥 팀 프로젝트
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
                    {user?.is_admin && (
                        <button
                            className="sidebarMenu"
                            onClick={() => window.open("/admin", "_blank")}
                            style={{ marginTop: "auto", color: "#dc2626", borderTop: "1px solid #fee2e2" }}
                        >
                            🛡️ 관리자 콘솔
                        </button>
                    )}
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
                                            <div className="profileDropdownItem" style={{ color: '#94a3b8', fontSize: '13px' }}>새 알림이 없습니다.</div>
                                        ) : (
                                            notifications.map(noti => (
                                                <button
                                                    key={noti.id}
                                                    className="profileDropdownItem"
                                                    onClick={() => {
                                                        setActiveTab(noti.link);

                                                        if (noti.type === 'chat' && noti.roomId) {
                                                            selectChatRoom(noti.roomId, noti.roomName || "채팅방");
                                                            setNotifications(prev => prev.filter(n => n.roomId !== noti.roomId));
                                                        } else if (noti.type.startsWith('friend')) {
                                                            setNotifications(prev => prev.filter(n => !n.type.startsWith('friend')));
                                                        } else {
                                                            setNotifications(prev => prev.filter(n => n.id !== noti.id));
                                                        }

                                                        setShowNotiMenu(false);
                                                    }}
                                                >
                                                    {noti.message}
                                                </button>
                                            ))
                                        )}
                                    </div>
                                    {notifications.length > 0 && (
                                        <button
                                            className="profileDropdownItem danger"
                                            onClick={() => {
                                                setNotifications([]);
                                                localStorage.removeItem("unread_notifications"); // 즉시 삭제[cite: 5]
                                            }}
                                            style={{ textAlign: 'center', borderTop: '1px solid #eee', marginTop: '8px' }}
                                        >
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
                                        {isDarkMode ? "☀️ 라이트모드" : "🌙 다크모드"}
                                    </button>

                                    {user?.is_admin && (
                                        <button
                                            className="profileDropdownItem"
                                            onClick={() => window.open("/admin", "_blank")}
                                            style={{ color: "#dc2626", fontWeight: 700 }}
                                        >
                                            🛡️ 관리자 콘솔
                                        </button>
                                    )}

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
                            <div className="dashboardTopbar">
                                <div>
                                    <h1 className="dashboardTitle">TODAY'S LEARNING</h1>
                                    <p className="dashboardSub">오늘 학습 현황을 한눈에 확인하세요</p>
                                </div>
                                <button className="createBtn" onClick={() => setActiveTab("lecture")}>
                                    + 새 강의 생성
                                </button>
                            </div>

                            <div className="dashboardGrid">
                                {/* 1. CURRENT LECTURE: 이미지 1번의 학습 요약 지표 연동 */}
                                <div className="dashboardCard largeCard">
                                    <div className="cardHeaderRow">
                                        <h3>학습 요약</h3>
                                        <span className="newBadge">SUMMARY</span>
                                    </div>
                                    <div className="statsGrid" style={{ marginTop: '10px' }}>
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

                                {/* 2. ANALYTICS: 이미지 2번과 동일한 색상 및 스타일 적용 */}
                                <div className="dashboardCard">
                                    <div className="cardHeaderRow">
                                        <h3>학습 집중도</h3>
                                        <span className="newBadge">ANALYTICS</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '10px' }}>
                                        <div className="focusItem">
                                            <div className="focusTop"><span className="focusLabel">강의 참여도</span><strong style={{ color: '#dc2626' }}>{analytics.participation}점</strong></div>
                                            <div className="progressTrack"><div className="progressFill" style={{ width: `${analytics.participation}%`, background: '#dc2626' }} /></div>
                                        </div>
                                        <div className="focusItem">
                                            <div className="focusTop"><span className="focusLabel">퀴즈 성취도</span><strong style={{ color: '#16a34a' }}>{analytics.achievement}점</strong></div>
                                            <div className="progressTrack"><div className="progressFill" style={{ width: `${analytics.achievement}%`, background: '#16a34a' }} /></div>
                                        </div>
                                        <div className="focusItem">
                                            <div className="focusTop"><span className="focusLabel">종합 집중도</span><strong style={{ color: '#f59e0b' }}>{analytics.focusScore}점</strong></div>
                                            <div className="progressTrack"><div className="progressFill" style={{ width: `${analytics.focusScore}%`, background: '#f59e0b' }} /></div>
                                        </div>
                                    </div>
                                </div>

                                {/* 3. SUMMARY: 제목 클릭 시 저장된 강의 탭으로 이동 및 해당 강의 자동 선택 */}
                                <div className="dashboardCard">
                                    <div className="cardHeaderRow">
                                        <h3>저장된 강의</h3>
                                        <button className="badge" style={{ cursor: 'pointer', border: 'none' }} onClick={() => setActiveTab("savedLectures")}>더보기 +</button>
                                    </div>
                                    <div className="summaryList">
                                        {savedLectures.slice(0, 4).map((lecture, idx) => (
                                            <div
                                                key={idx}
                                                className="summaryRow"
                                                style={{ cursor: 'pointer', transition: 'background 0.2s', padding: '12px 8px', borderRadius: '8px' }}
                                                onClick={() => {
                                                    handleSelectLecture(lecture); // 해당 강의 선택 상태로 변경
                                                    setActiveTab("savedLectures"); // 탭 이동
                                                }}
                                                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
                                                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <span style={{ fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>{lecture.title}</span>
                                                <strong style={{ color: '#64748b', fontSize: '13px' }}>{new Date(lecture.created_at).toLocaleDateString()}</strong>
                                            </div>
                                        ))}
                                        {savedLectures.length === 0 && <div className="emptyBox">저장된 요약본이 없습니다.</div>}
                                    </div>
                                </div>

                                {/* 4. QUICK ACCESS: 실제 메뉴 이동 기능 연결 */}
                                <div className="dashboardCard">
                                    <div className="cardHeaderRow">
                                        <h3>빠른 실행</h3>
                                    </div>
                                    <div className="quickMenuGrid">
                                        <button className="quickMenuBtn" onClick={() => setActiveTab("reviewQuiz")}>
                                            ✏️
                                            <span>퀴즈</span>
                                        </button>
                                        <button className="quickMenuBtn" onClick={() => setActiveTab("savedLectures")}>
                                            📂
                                            <span>강의</span>
                                        </button>
                                        <button className="quickMenuBtn" onClick={() => setActiveTab("chat")}>
                                            💬
                                            <span>채팅</span>
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

                                        <div
                                            className="filePickerBox"
                                            style={{
                                                display: "grid",
                                                gap: 10,
                                            }}
                                        >
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                multiple
                                                accept="image/*,.pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.csv,.hwpx,.hwp"
                                                onChange={(e) => setLectureFiles(Array.from(e.target.files || []))}
                                                style={{ display: "none" }}
                                            />

                                            <div
                                                style={{
                                                    display: "flex",
                                                    gap: 8,
                                                    flexWrap: "wrap",
                                                    alignItems: "center",
                                                }}
                                            >
                                                <button
                                                    type="button"
                                                    className="secondaryBtn filePickerButton"
                                                    onClick={() => fileInputRef.current?.click()}
                                                    disabled={selectedLecture && !isEditMode}
                                                    style={{
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        gap: 6,
                                                    }}
                                                >
                                                    📎 파일 선택
                                                </button>

                                                {lectureFiles.length > 0 && (
                                                    <button
                                                        type="button"
                                                        className="secondaryBtn filePickerClearButton"
                                                        onClick={() => {
                                                            setLectureFiles([]);
                                                            if (fileInputRef.current) {
                                                                fileInputRef.current.value = "";
                                                            }
                                                        }}
                                                        disabled={selectedLecture && !isEditMode}
                                                        style={{
                                                            display: "inline-flex",
                                                            alignItems: "center",
                                                            gap: 6,
                                                        }}
                                                    >
                                                        선택 취소
                                                    </button>
                                                )}

                                                <span className="filePickerCount">
                                                    {lectureFiles.length > 0
                                                        ? `${lectureFiles.length}개 파일 선택됨`
                                                        : "선택된 파일 없음"}
                                                </span>
                                            </div>

                                            {lectureFiles.length > 0 && (
                                                <div className="filePickerList">
                                                    {lectureFiles.map((file, index) => (
                                                        <div key={`${file.name}-${index}`} className="filePickerItem">
                                                            <span>📄</span>
                                                            <span className="filePickerName">{file.name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

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
                                                        <div style={{ position: 'relative', display: 'inline-block' }}>
                                                            <button
                                                                className="secondaryBtn"
                                                                onClick={initiateRecording}
                                                                disabled={isTranscribing || isSummarizing}
                                                            >
                                                                🎙️ 녹음 시작
                                                            </button>

                                                            {/* 1단계: 이어하기 질문창 (팝업 대체) */}
                                                            {showAppendAsk && (
                                                                <div style={{
                                                                    position: 'absolute', bottom: '110%', left: '0',
                                                                    background: '#fff', border: '1px solid #2383e2',
                                                                    borderRadius: '8px', padding: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                                                                    zIndex: 100, minWidth: '260px'
                                                                }}>
                                                                    <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '10px' }}>
                                                                        기존 녹음 내용이 있습니다.
                                                                    </div>
                                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                                        <button
                                                                            className="primaryBtn" style={{ fontSize: '11px', flex: 1 }}
                                                                            onClick={() => handleAppendChoice(true)}
                                                                        >
                                                                            이어서 녹음
                                                                        </button>
                                                                        <button
                                                                            className="secondaryBtn" style={{ fontSize: '11px', flex: 1 }}
                                                                            onClick={() => handleAppendChoice(false)}
                                                                        >
                                                                            새로 시작
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* 2단계: 장치 선택창 */}
                                                            {showRecordingChoice && (
                                                                <div style={{
                                                                    position: 'absolute', bottom: '110%', left: '0',
                                                                    background: '#fff', border: '1px solid #ddd',
                                                                    borderRadius: '8px', padding: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                                                                    display: 'flex', gap: '8px', zIndex: 100, minWidth: '300px'
                                                                }}>
                                                                    <button
                                                                        className="primaryBtn" style={{ fontSize: '12px', padding: '8px 12px', flex: 1 }}
                                                                        onClick={() => executeStartRecording(true)}
                                                                    >
                                                                        🖥️ 화면/인강 공유
                                                                    </button>
                                                                    <button
                                                                        className="secondaryBtn" style={{ fontSize: '12px', padding: '8px 12px', flex: 1 }}
                                                                        onClick={() => executeStartRecording(false)}
                                                                    >
                                                                        🎙️ 마이크/스피커
                                                                    </button>
                                                                    <button onClick={() => setShowRecordingChoice(false)} style={{ border: 'none', background: 'none', color: '#999' }}>✕</button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <button className="secondaryBtn" onClick={stopRecording}>⏹️ 녹음 종료</button>
                                                    )}
                                                    {isTranscribing && (
                                                        <span className="badge">Whisper 변환 중...</span>
                                                    )}

                                                    <button
                                                        type="button"
                                                        className="secondaryBtn"
                                                        onClick={openFolderSelectForNewLecture}
                                                        disabled={isSummarizing}
                                                        style={{
                                                            display: "inline-flex",
                                                            alignItems: "center",
                                                            gap: 6,
                                                        }}
                                                    >
                                                        📁 {newLectureFolderName ? newLectureFolderName : "폴더 선택"}
                                                    </button>

                                                    <button
                                                        className="primaryBtn"
                                                        onClick={handleGenerateSummary}
                                                        disabled={isSummarizing || isRecording || isTranscribing}
                                                    >
                                                        {isSummarizing ? "AI 요약 중." : "AI 요약 생성"}
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
                            {/* 왼쪽: 폴더 + 강의 목록 */}
                            <div className="leftPanel">
                                <div className="card">
                                    <div style={{ marginBottom: 18 }}>
                                        <h2 style={{ marginBottom: 12 }}>강의 폴더</h2>

                                        <button
                                            className="secondaryBtn"
                                            onClick={handleCreateFolder}
                                            style={{
                                                padding: "8px 12px",
                                                fontSize: 13,
                                                width: "fit-content",
                                            }}
                                        >
                                            + 새 폴더 만들기
                                        </button>
                                    </div>

                                    <div className="historyList">
                                        <button
                                            className={`historyItem ${activeLectureFolder === "ALL" ? "historyItemActive" : ""}`}
                                            onClick={() => setActiveLectureFolder("ALL")}
                                            style={{ width: "100%", textAlign: "left", marginBottom: 8 }}
                                        >
                                            <div className="historyTitle">📚 모든 강의</div>
                                            <div className="historyMeta">{savedLectures.length}개</div>
                                        </button>

                                        {folders.map((folder) => {
                                            const count = savedLectures.filter(
                                                (lecture) => lecture.folder_name === folder.name
                                            ).length;

                                            return (
                                                <div
                                                    key={folder.id || folder.name}
                                                    className={`historyItem ${activeLectureFolder === folder.name ? "historyItemActive" : ""}`}
                                                    onClick={() => setActiveLectureFolder(folder.name)}
                                                    style={{
                                                        width: "100%",
                                                        textAlign: "left",
                                                        marginBottom: 8,
                                                        display: "flex",
                                                        justifyContent: "space-between",
                                                        alignItems: "center",
                                                        gap: 8,
                                                        cursor: "pointer",
                                                    }}
                                                >
                                                    <div className="folderItemInfo">
                                                        <div className="historyTitle folderItemTitle">📁 {folder.name}</div>
                                                        <div className="historyMeta">{count}개</div>
                                                    </div>

                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            gap: 4,
                                                            flexShrink: 0,
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => openEditFolderModal(folder)}
                                                            title="폴더 이름 수정"
                                                            style={{
                                                                border: "none",
                                                                background: "#f1f5f9",
                                                                borderRadius: 10,
                                                                width: 30,
                                                                height: 30,
                                                                cursor: "pointer",
                                                            }}
                                                        >
                                                            ✏️
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => openDeleteFolderModal(folder)}
                                                            title="폴더 삭제"
                                                            style={{
                                                                border: "none",
                                                                background: "#fee2e2",
                                                                color: "#dc2626",
                                                                borderRadius: 10,
                                                                width: 30,
                                                                height: 30,
                                                                cursor: "pointer",
                                                            }}
                                                        >
                                                            🗑️
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="card">
                                    <div className="sectionHeader">
                                        <h2>
                                            {activeLectureFolder === "ALL" ? "모든 강의" : activeLectureFolder}
                                        </h2>

                                        <span className="badge">
                                            {loadingLectures
                                                ? "불러오는 중"
                                                : `${filteredLectures.length} / ${savedLectures.length}개`}
                                        </span>
                                    </div>

                                    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                                        <input
                                            className="input"
                                            placeholder="🔍 제목, 내용, 키워드 검색"
                                            value={lectureSearch}
                                            onChange={(e) => setLectureSearch(e.target.value)}
                                        />

                                        <select
                                            className="input"
                                            value={lectureSortOrder}
                                            onChange={(e) => setLectureSortOrder(e.target.value)}
                                            style={{ maxWidth: 120 }}
                                        >
                                            <option value="newest">최신순</option>
                                            <option value="oldest">오래된순</option>
                                        </select>
                                    </div>

                                    <div className="historyList">
                                        {loadingLectures ? (
                                            <div className="emptyBox">강의 목록을 불러오는 중입니다.</div>
                                        ) : filteredLectures.length === 0 ? (
                                            <div className="emptyBox">
                                                {activeLectureFolder === "ALL"
                                                    ? "저장된 강의가 없습니다."
                                                    : "이 폴더에는 강의가 없습니다."}
                                            </div>
                                        ) : (
                                            filteredLectures.map((lecture) => (
                                                <div
                                                    key={lecture.id}
                                                    style={{
                                                        position: "relative",
                                                        marginBottom: 8,
                                                    }}
                                                >
                                                    <button
                                                        className={`historyItem ${selectedLecture?.id === lecture.id ? "historyItemActive" : ""}`}
                                                        onClick={() => handleSelectLecture(lecture)}
                                                        style={{
                                                            width: "100%",
                                                            textAlign: "left",
                                                            paddingRight: 80,
                                                        }}
                                                    >
                                                        <div className="historyTitle">
                                                            {lecture.title || "제목 없음"}
                                                        </div>

                                                        <div className="historyMeta">
                                                            {lecture.created_at
                                                                ? new Date(lecture.created_at).toLocaleDateString()
                                                                : "날짜 없음"}
                                                        </div>
                                                    </button>

                                                    <div
                                                        style={{
                                                            position: "absolute",
                                                            right: 8,
                                                            top: "50%",
                                                            transform: "translateY(-50%)",
                                                            display: "flex",
                                                            gap: 6,
                                                            alignItems: "center",
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                openShareModal(lecture);
                                                            }}
                                                            style={{
                                                                background: "none",
                                                                border: "none",
                                                                cursor: "pointer",
                                                                fontSize: 16,
                                                            }}
                                                            title="공유"
                                                        >
                                                            📤
                                                        </button>

                                                        <button
                                                            onClick={(e) => openDeleteLectureModal(e, lecture)}
                                                            style={{
                                                                background: "none",
                                                                border: "none",
                                                                cursor: "pointer",
                                                                fontSize: 16,
                                                            }}
                                                            title="삭제"
                                                        >
                                                            🗑️
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>


                            {/* 오른쪽: 선택한 강의 상세 */}
                            <div className="rightPanel">
                                {selectedLecture ? (
                                    <div className="card">
                                        <div className="sectionHeader">
                                            <div>
                                                <h2>{selectedLecture.title || "제목 없음"}</h2>

                                                {selectedLecture.folder_name && (
                                                    <div className="historyMeta" style={{ marginTop: 6 }}>
                                                        📁 {selectedLecture.folder_name}
                                                    </div>
                                                )}
                                            </div>

                                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                                <button
                                                    className="secondaryBtn"
                                                    onClick={() => openFolderSelectForLecture(selectedLecture)}
                                                >
                                                    📁 폴더 넣기
                                                </button>

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
                                        </div>

                                        <h3>강의 내용</h3>
                                        <div className="summaryBox">
                                            <div style={{ display: "grid", gap: 12 }}>
                                                {selectedLecture.analysisTitle && (
                                                    <div style={{ fontWeight: 900, fontSize: 18 }}>
                                                        {selectedLecture.analysisTitle}
                                                    </div>
                                                )}

                                                <div style={{ fontSize: 13, opacity: 0.8 }}>
                                                    과목 유형: {selectedLecture.subjectType || "general"}
                                                </div>

                                                {selectedLecture.summary ? (
                                                    <div style={{ lineHeight: 1.7 }}>
                                                        {selectedLecture.summary}
                                                    </div>
                                                ) : (
                                                    <div>요약이 없습니다.</div>
                                                )}
                                            </div>
                                        </div>

                                        {selectedLecture.studyGuide && (
                                            <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
                                                {Array.isArray(selectedLecture.studyGuide.coreConcepts) &&
                                                    selectedLecture.studyGuide.coreConcepts.length > 0 && (
                                                        <div className="summaryBox">
                                                            <h3 style={{ marginTop: 0 }}>📘 핵심 개념</h3>
                                                            {selectedLecture.studyGuide.coreConcepts.map((item, idx) => (
                                                                <div key={`concept-${idx}`} style={{ marginBottom: 14 }}>
                                                                    <strong>{item.title}</strong>
                                                                    <p style={{ margin: "6px 0", lineHeight: 1.6 }}>
                                                                        {item.explanation}
                                                                    </p>
                                                                    {item.whyImportant && (
                                                                        <p style={{ margin: 0, opacity: 0.8 }}>
                                                                            중요성: {item.whyImportant}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                {Array.isArray(selectedLecture.studyGuide.codeHighlights) &&
                                                    selectedLecture.studyGuide.codeHighlights.length > 0 && (
                                                        <div className="summaryBox">
                                                            <h3 style={{ marginTop: 0 }}>💻 중요 코드</h3>
                                                            {selectedLecture.studyGuide.codeHighlights.map((item, idx) => (
                                                                <div key={`code-${idx}`} style={{ marginBottom: 16 }}>
                                                                    <pre
                                                                        style={{
                                                                            whiteSpace: "pre-wrap",
                                                                            wordBreak: "break-word",
                                                                            padding: 12,
                                                                            borderRadius: 12,
                                                                            background: "rgba(15,23,42,0.08)",
                                                                            overflowX: "auto",
                                                                        }}
                                                                    >
                                                                        <code>{item.code}</code>
                                                                    </pre>
                                                                    <p style={{ margin: "8px 0", lineHeight: 1.6 }}>
                                                                        {item.explanation}
                                                                    </p>
                                                                    {item.flow && (
                                                                        <p style={{ margin: 0, opacity: 0.8 }}>
                                                                            흐름: {item.flow}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                {Array.isArray(selectedLecture.studyGuide.formulas) &&
                                                    selectedLecture.studyGuide.formulas.length > 0 && (
                                                        <div className="summaryBox">
                                                            <h3 style={{ marginTop: 0 }}>🧮 공식 / 기호</h3>
                                                            {selectedLecture.studyGuide.formulas.map((item, idx) => (
                                                                <div key={`formula-${idx}`} style={{ marginBottom: 14 }}>
                                                                    <strong>{item.formula}</strong>
                                                                    <p style={{ margin: "6px 0" }}>{item.meaning}</p>
                                                                    {item.useCase && <p style={{ margin: 0 }}>사용: {item.useCase}</p>}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                {Array.isArray(selectedLecture.studyGuide.examPoints) &&
                                                    selectedLecture.studyGuide.examPoints.length > 0 && (
                                                        <div className="summaryBox">
                                                            <h3 style={{ marginTop: 0 }}>🔥 시험 포인트</h3>
                                                            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
                                                                {selectedLecture.studyGuide.examPoints.map((point, idx) => (
                                                                    <li key={`exam-${idx}`}>{point}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}

                                                {Array.isArray(selectedLecture.studyGuide.commonMistakes) &&
                                                    selectedLecture.studyGuide.commonMistakes.length > 0 && (
                                                        <div className="summaryBox">
                                                            <h3 style={{ marginTop: 0 }}>⚠️ 자주 틀리는 부분</h3>
                                                            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
                                                                {selectedLecture.studyGuide.commonMistakes.map((point, idx) => (
                                                                    <li key={`mistake-${idx}`}>{point}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}

                                                {Array.isArray(selectedLecture.studyGuide.practiceTasks) &&
                                                    selectedLecture.studyGuide.practiceTasks.length > 0 && (
                                                        <div className="summaryBox">
                                                            <h3 style={{ marginTop: 0 }}>📝 연습 / 실습</h3>
                                                            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
                                                                {selectedLecture.studyGuide.practiceTasks.map((task, idx) => (
                                                                    <li key={`task-${idx}`}>{task}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                            </div>
                                        )}

                                        <button
                                            type="button"
                                            className="secondaryBtn"
                                            onClick={() => setShowRawText((prev) => !prev)}
                                            style={{ marginTop: 18 }}
                                        >
                                            {showRawText ? "원문 접기" : "추출 원문 보기"}
                                        </button>

                                        {showRawText && (
                                            <div className="summaryBox" style={{ marginTop: 12, maxHeight: 260, overflow: "auto" }}>
                                                {lectureText || selectedLecture.raw_text || "저장된 원문이 없습니다."}
                                            </div>
                                        )}

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
                                                        📎 {displayFileName(file)}
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
                                    <div style={{ fontSize: 15, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>퀴즈를 생성해보세요!</div>
                                    <div style={{ fontSize: 13 }}>위 설정을 선택한 뒤 "퀴즈 생성하기" 버튼을 눌러주세요.</div>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
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
                        <>
                            {/* 상단 프로젝트 메뉴 */}
                            <div className="card" style={{ marginBottom: 18 }}>
                                <h2>팀 프로젝트</h2>

                                <p className="subText">
                                    팀원과 채팅하고 공동 보드에서 아이디어를 정리할 수 있습니다.
                                </p>

                                <div className="buttonRow" style={{ marginTop: 14 }}>
                                    <button
                                        className={projectView === "chat" ? "primaryBtn" : "secondaryBtn"}
                                        onClick={() => setProjectView("chat")}
                                    >
                                        팀 채팅
                                    </button>

                                    <button
                                        className={projectView === "board" ? "primaryBtn" : "secondaryBtn"}
                                        onClick={() => setProjectView("board")}
                                    >
                                        공동 보드
                                    </button>
                                </div>
                            </div>

                            {/* 팀 채팅 */}
                            {projectView === "chat" && (
                                <div className="gridLayout chatGridLayout">
                                    {/* 1. 왼쪽 사이드바: 친구 추가 및 목록 */}
                                    <div className="card" style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

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

                                        <div className="historyList">
                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    alignItems: "center",
                                                    marginTop: 16,
                                                    marginBottom: 12,
                                                    gap: 8,
                                                }}
                                            >
                                                <h3 style={{ fontSize: 16, margin: 0 }}>내 단체방</h3>

                                                <button
                                                    type="button"
                                                    className="secondaryBtn"
                                                    onClick={openGroupCreateModal}
                                                    style={{
                                                        padding: "8px 10px",
                                                        fontSize: 12,
                                                        whiteSpace: "nowrap",
                                                    }}
                                                >
                                                    + 단체방 만들기
                                                </button>
                                            </div>

                                            {groupRooms.length === 0 ? (
                                                <div className="emptyBox" style={{ marginBottom: 12 }}>
                                                    생성된 단체방이 없습니다.
                                                </div>
                                            ) : (
                                                groupRooms.map((room) => (
                                                    <div
                                                        key={room.room_id}
                                                        style={{
                                                            position: "relative",
                                                            marginBottom: 10,
                                                        }}
                                                    >
                                                        <button
                                                            className={`historyItem ${currentRoomId === room.room_id ? "historyItemActive" : ""}`}
                                                            onClick={() => selectChatRoom(room.room_id, room.room_name)}
                                                            style={{
                                                                width: "100%",
                                                                textAlign: "left",
                                                                paddingRight: 45,
                                                            }}
                                                        >
                                                            <div className="historyTitle">👥 {room.room_name}</div>
                                                        </button>

                                                        <button
                                                            onClick={(e) => handleLeaveGroupRoom(e, room.room_id)}
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
                                                            }}
                                                            title="방 나가기"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                ))
                                            )}

                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    alignItems: "center",
                                                    marginTop: 22,
                                                    marginBottom: 12,
                                                    gap: 8,
                                                }}
                                            >
                                                <h3 style={{ fontSize: 16, margin: 0 }}>내 친구</h3>

                                                <div style={{ display: "flex", gap: 6 }}>
                                                    <button
                                                        type="button"
                                                        className="secondaryBtn"
                                                        onClick={openFriendSearchModal}
                                                        style={{
                                                            padding: "8px 10px",
                                                            fontSize: 12,
                                                            whiteSpace: "nowrap",
                                                        }}
                                                    >
                                                        🔍 검색
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className="primaryBtn"
                                                        onClick={openFriendAddModal}
                                                        style={{
                                                            padding: "8px 10px",
                                                            fontSize: 12,
                                                            whiteSpace: "nowrap",
                                                        }}
                                                    >
                                                        + 친구 추가
                                                    </button>
                                                </div>
                                            </div>

                                            {friends.length === 0 ? (
                                                <div className="emptyBox">친구가 없습니다.</div>
                                            ) : (
                                                friends.map((friend) => (
                                                    <button
                                                        key={friend.user_id}
                                                        className={`historyItem ${currentRoomId === `private_${[Number(user.user_id), Number(friend.user_id)].sort((a, b) => a - b).join("_")}` ? "historyItemActive" : ""}`}
                                                        onClick={() => enterPrivateChat(friend)}
                                                        style={{
                                                            width: "100%",
                                                            textAlign: "left",
                                                            marginBottom: 10,
                                                        }}
                                                    >
                                                        <div className="historyTitle">👤 {friend.name}</div>
                                                        <div style={{ fontSize: 11, color: "#64748b" }}>
                                                            {friend.email}
                                                        </div>
                                                    </button>
                                                ))
                                            )}
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
                                                                    {(() => {
                                                                        const raw = msg.text ?? msg.message ?? "";
                                                                        try {
                                                                            const parsed = JSON.parse(raw);
                                                                            if (parsed.type === "lecture_share") {
                                                                                const fullSummary = parsed.summary || "";
                                                                                const isTruncated = fullSummary.length >= 120;
                                                                                const displaySummary = isTruncated ? fullSummary.slice(0, 120) : fullSummary;
                                                                                return (
                                                                                    <div style={{
                                                                                        background: "#f0f7ff",
                                                                                        border: "1px solid #bfdbfe",
                                                                                        borderRadius: "10px",
                                                                                        padding: "10px 14px",
                                                                                        minWidth: "200px",
                                                                                        maxWidth: "280px",
                                                                                        textAlign: "left",
                                                                                    }}>
                                                                                        <div style={{ fontSize: "11px", color: "#3b82f6", fontWeight: 600, marginBottom: "4px" }}>
                                                                                            📚 강의 공유
                                                                                        </div>
                                                                                        <div style={{ fontSize: "14px", fontWeight: 600, color: "#1e3a5c", marginBottom: "4px" }}>
                                                                                            {parsed.title}
                                                                                        </div>
                                                                                        {fullSummary && (
                                                                                            <div style={{ fontSize: "12px", color: "#475569", marginBottom: "6px", lineHeight: 1.4 }}>
                                                                                                {displaySummary}{isTruncated && "..."}
                                                                                                {isTruncated && (
                                                                                                    <span
                                                                                                        onClick={() => setLectureSummaryModal({ title: parsed.title, summary: fullSummary })}
                                                                                                        style={{
                                                                                                            display: "inline-block",
                                                                                                            marginLeft: "4px",
                                                                                                            fontSize: "11px",
                                                                                                            color: "#3b82f6",
                                                                                                            cursor: "pointer",
                                                                                                            fontWeight: 600,
                                                                                                            textDecoration: "underline",
                                                                                                        }}
                                                                                                    >
                                                                                                        더보기
                                                                                                    </span>
                                                                                                )}
                                                                                            </div>
                                                                                        )}
                                                                                        {parsed.keywords && parsed.keywords.length > 0 && (
                                                                                            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                                                                                                {parsed.keywords.map((kw, ki) => (
                                                                                                    <span key={ki} style={{
                                                                                                        fontSize: "11px",
                                                                                                        background: "#dbeafe",
                                                                                                        color: "#1e40af",
                                                                                                        borderRadius: "999px",
                                                                                                        padding: "2px 8px",
                                                                                                    }}>{kw}</span>
                                                                                                ))}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            }
                                                                        } catch (_) { }
                                                                        return raw;
                                                                    })()}
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
                            {/* 공동 보드 */}
                            {projectView === "board" && (
                                <BoardPage onBack={() => setProjectView("chat")} />
                            )}
                        </>
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

                    {activeTab === "exam" && (
                        <div className="gridLayout savedLecturesGridLayout">
                            {/* 왼쪽: 강의 목록 선택 */}
                            <div className="leftPanel">
                                <div className="card">
                                    <div className="sectionHeader">
                                        <h2>강의 선택</h2>
                                    </div>
                                    <div className="historyList">
                                        {savedLectures.length === 0 ? (
                                            <div className="emptyBox">저장된 강의가 없습니다.</div>
                                        ) : (
                                            savedLectures.map((lecture) => (
                                                <button
                                                    key={lecture.id}
                                                    className={`historyItem ${selectedLecture?.id === lecture.id ? "historyItemActive" : ""}`}
                                                    onClick={() => setSelectedLecture(lecture)}
                                                >
                                                    <div className="historyTitle">{lecture.title}</div>
                                                    <div className="historyMeta">{new Date(lecture.created_at).toLocaleDateString()}</div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* 오른쪽: 선택한 강의의 키워드 중요도 순위 */}
                            <div className="rightPanel">
                                <div className="card">
                                    <div className="sectionHeader">
                                        <h2>{selectedLecture ? `${selectedLecture.title} 강의 중요도` : "강의를 선택하세요"}</h2>
                                        {selectedLecture && <span className="badge">단일 강의 분석</span>}
                                    </div>

                                    {!selectedLecture ? (
                                        <div className="emptyBox">왼쪽에서 강의 제목을 누르면<br />해당 강의의 시험 중요도 순위가 나옵니다.</div>
                                    ) : (
                                        <div className="list">
                                            {/* 해당 강의의 키워드들만 추출하여 점수화 (빈도 기반) */}
                                            {(() => {
                                                const counts = {};
                                                const keywords = Array.isArray(selectedLecture.keywords) ? selectedLecture.keywords : [];
                                                const rawText = String(selectedLecture.raw_text || "").toLowerCase();

                                                keywords.forEach(word => {
                                                    const key = String(word).trim();
                                                    if (!key) return;
                                                    const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                                                    const matches = rawText.match(regex);
                                                    counts[key] = matches ? matches.length : 1;
                                                });

                                                const sortedItems = Object.entries(counts)
                                                    .map(([word, freq]) => ({
                                                        word,
                                                        frequency: freq,
                                                        score: Math.min(freq * 20, 100)
                                                    }))
                                                    .sort((a, b) => b.score - a.score);

                                                if (sortedItems.length === 0) return <div className="emptyBox">추출된 키워드가 없습니다.</div>;

                                                return sortedItems.map((item, idx) => {
                                                    const tier = getTier(item.score);
                                                    return (
                                                        <div key={item.word} className="importanceRow">
                                                            <div className="importanceRank">{idx + 1}</div>
                                                            <div className="importanceMain">
                                                                <div className="historyTitle">{item.word}</div>
                                                                <div className="historyMeta">이 강의에서 {item.frequency}회 등장</div>
                                                            </div>
                                                            <div className="importanceSide">
                                                                <span className="importanceTier" style={{ color: tier.color, background: tier.bg }}>{tier.label}</span>
                                                                <div className="importanceScore">{item.score}점</div>
                                                            </div>
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    )}
                                </div>
                            </div>
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
                    {/* ── 강의 공유 모달 ─────────────────────────────── */}
                    {shareModal && (
                        <div
                            className="appModalOverlay"
                            style={{
                                position: "fixed", inset: 0, zIndex: 9999,
                                background: "rgba(0,0,0,0.45)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                            }} onClick={() => setShareModal(null)}>
                            <div
                                className="appModalPanel"
                                style={{
                                    background: "#fff", borderRadius: "16px",
                                    padding: "28px 28px 24px", width: "360px",
                                    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
                                }} onClick={(e) => e.stopPropagation()}>
                                <h3 className="appModalTitle" style={{ margin: "0 0 6px", fontSize: "18px", color: "#1e3a5c" }}>
                                    강의 공유
                                </h3>
                                <p className="appModalText" style={{ margin: "0 0 16px", fontSize: "13px", color: "#64748b" }}>
                                    채팅방을 선택하면 해당 강의가 메시지로 전송됩니다.
                                </p>

                                {/* 공유할 강의 미리보기 */}
                                <div
                                    className="appModalInfoBox"
                                    style={{
                                        background: "#f0f7ff", border: "1px solid #bfdbfe",
                                        borderRadius: "10px", padding: "12px 14px", marginBottom: "16px",
                                    }}>
                                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#1e3a5c", marginBottom: "4px" }}>
                                        {shareModal.lecture.title || "제목 없음"}
                                    </div>
                                    {shareModal.lecture.keywords?.length > 0 && (
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
                                            {shareModal.lecture.keywords.slice(0, 5).map((kw, i) => (
                                                <span key={i} style={{
                                                    fontSize: "11px", background: "#dbeafe",
                                                    color: "#1e40af", borderRadius: "999px", padding: "2px 8px",
                                                }}>{kw}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* 채팅방 선택 */}
                                <label className="appModalText" style={{ fontSize: "13px", color: "#374151", display: "block", marginBottom: "6px" }}>
                                    보낼 채팅방 선택
                                </label>
                                <select
                                    className="input"
                                    value={shareTargetRoom}
                                    onChange={(e) => setShareTargetRoom(e.target.value)}
                                    style={{
                                        width: "100%", padding: "8px 12px", fontSize: "14px",
                                        border: "1px solid #d1d5db", borderRadius: "8px",
                                        marginBottom: "18px", color: "#1e293b",
                                    }}
                                >
                                    <option value="">-- 채팅방을 선택하세요 --</option>
                                    <option value="team-room">🌐 전체 팀 채팅방</option>
                                    {groupRooms.map((room) => (
                                        <option key={room.room_id} value={room.room_id}>
                                            👥 {room.room_name}
                                        </option>
                                    ))}
                                    {friends.map((f) => {
                                        const ids = [Number(user?.user_id), Number(f.user_id)].sort((a, b) => a - b);
                                        const roomId = `private_${ids[0]}_${ids[1]}`;
                                        return (
                                            <option key={f.user_id} value={roomId}>
                                                💬 {f.name}
                                            </option>
                                        );
                                    })}
                                </select>

                                <div style={{ display: "flex", gap: "10px" }}>
                                    <button
                                        className="secondaryBtn"
                                        onClick={() => setShareModal(null)}
                                        style={{
                                            flex: 1, padding: "10px", borderRadius: "8px",
                                            border: "1px solid #d1d5db", background: "#fff",
                                            fontSize: "14px", cursor: "pointer", color: "#374151",
                                        }}
                                    >
                                        취소
                                    </button>
                                    <button
                                        className="primaryBtn"
                                        onClick={handleShareLecture}
                                        disabled={!shareTargetRoom}
                                        style={{
                                            flex: 1, padding: "10px", borderRadius: "8px",
                                            border: "none", background: shareTargetRoom ? "#2383e2" : "#cbd5e1",
                                            fontSize: "14px", cursor: shareTargetRoom ? "pointer" : "not-allowed",
                                            color: "#fff", fontWeight: 600,
                                        }}
                                    >
                                        공유하기
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    {/* ── 강의 원문 보기 모달 ─────────────────────────────── */}
                    {lectureSummaryModal && (
                        <div
                            className="appModalOverlay"
                            style={{
                                position: "fixed", inset: 0, zIndex: 9999,
                                background: "rgba(0,0,0,0.45)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                            }}
                            onClick={() => setLectureSummaryModal(null)}
                        >
                            <div
                                className="appModalPanel"
                                style={{
                                    background: "#fff", borderRadius: "16px",
                                    padding: "28px 28px 24px", width: "480px", maxWidth: "90vw",
                                    maxHeight: "70vh", display: "flex", flexDirection: "column",
                                    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h3 className="appModalTitle" style={{ margin: "0 0 8px", fontSize: "16px", color: "#1e3a5c" }}>
                                    📚 {lectureSummaryModal.title}
                                </h3>
                                <div
                                    className="appModalText"
                                    style={{
                                        fontSize: "14px", color: "#475569", lineHeight: 1.7,
                                        overflowY: "auto", flex: 1, whiteSpace: "pre-wrap",
                                        borderTop: "1px solid #e2e8f0", paddingTop: "12px",
                                    }}
                                >
                                    {lectureSummaryModal.summary}
                                </div>
                                <button
                                    onClick={() => setLectureSummaryModal(null)}
                                    style={{
                                        marginTop: "16px", padding: "10px",
                                        borderRadius: "8px", border: "none",
                                        background: "#2383e2", color: "#fff",
                                        fontSize: "14px", cursor: "pointer", fontWeight: 600,
                                    }}
                                >
                                    닫기
                                </button>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>

    );
}

export default App;