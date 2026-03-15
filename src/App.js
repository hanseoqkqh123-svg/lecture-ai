import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

export default function App() {
    const [currentScreen, setCurrentScreen] = useState("home");
    const [selectedHistory, setSelectedHistory] = useState(null);

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

    const friends = [
        { id: 'f1', name: "이한서", status: "...", type: "individual" },
        { id: 'f2', name: "전찬구", status: ".", type: "individual" },
        { id: 'f3', name: "김서진", status: "^_^", type: "individual" },
        { id: 'f4', name: "김승민", status: " ", type: "individual" }
    ];

    const [chatRooms, setChatRooms] = useState([
        { id: 1, type: "group", name: "캡스톤 9조", participants: ['f1', 'f2', 'f3'], lastMessage: "제가 어제 정리한 부분도 올릴게요!", time: "오전 10:10", unread: 2 },
        { id: 2, type: "individual", name: "이한서", participants: ['f1'], lastMessage: "혹시 프론트엔드쪽 추가 수정사항 있을까요?", time: "오전 09:30", unread: 0 },
        { id: 3, type: "group", name: "정보처리기사 스터디", participants: ['f4'], lastMessage: "내일까지 과제 제출 꼭 부탁드립니다", time: "어제", unread: 0 }
    ]);

    const [messages, setMessages] = useState({
        1: [
            { id: 1, sender: "system", text: "캡스톤 9조 단체 채팅방입니다.", date: "2026년 3월 14일 토요일", time: "오전 09:00" },
            { id: 2, sender: "other", senderName: "김서진", text: "파일 공유해주실 수 있나요?", date: "2026년 3월 15일 일요일", time: "오전 10:05" },
            { id: 3, sender: "me", text: "제가 어제 정리한 부분도 올릴게요!", date: "2026년 3월 15일 일요일", time: "오전 10:10", readCount: 2 },
            { id: 4, sender: "me", text: "다들 확인 부탁드려요~", date: "2026년 3월 15일 일요일", time: "오전 10:11", readCount: 0 }
        ],
        2: [
            { id: 1, sender: "other", senderName: "이한서", text: "코드 파일 보내드렸습니다", date: "2026년 3월 14일 토요일", time: "어제" },
            { id: 2, sender: "me", text: "확인했습니다! 감사합니다.", date: "2026년 3월 14일 토요일", time: "어제", readCount: 1 },
            { id: 3, sender: "me", text: "혹시 추가 수정사항 있을까요?", date: "2026년 3월 15일 일요일", time: "오전 09:30", readCount: 0 }
        ],
        3: [
            { id: 1, sender: "other", senderName: "김승민", text: "내일까지 과제 제출 꼭 부탁드립니다", date: "2026년 3월 14일 토요일", time: "어제" }
        ]
    });

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
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [resizing]);

    useEffect(() => { return () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }; }, [audioUrl]);

    async function handleStartRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];
            setRecordingStatus("녹음 중...");
            setAudioUrl("");
            mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
                setAudioUrl(URL.createObjectURL(audioBlob));
                setRecordingStatus("녹음 완료");
                stream.getTracks().forEach((track) => track.stop());
            };
            mediaRecorder.start();
            setIsRecording(true);
        } catch (error) { setRecordingStatus("마이크 권한이 없거나 녹음을 시작할 수 없습니다."); }
    }

    function handleStopRecording() {
        if (mediaRecorderRef.current && isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); }
    }

    const stopWords = new Set(["은", "는", "이", "가", "을", "를", "에", "의", "과", "와", "도", "으로", "에서", "하다", "하는", "하고", "한다", "있다", "주어진", "대표적인", "반복적으로", "위해", "함수는", "방법이다", "기술이다"]);
    const sentenceList = useMemo(() => rawText.split(/(?<=[.!?다])\s+/).map((s) => s.trim()).filter(Boolean), [rawText]);

    function extractKeywords(text) {
        const words = text.replace(/[^가-힣a-zA-Z0-9\s]/g, " ").split(/\s+/).map((w) => w.trim()).filter((w) => w.length >= 2 && !stopWords.has(w));
        const freq = {};
        words.forEach((w) => { freq[w] = (freq[w] || 0) + 1; });
        return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([word, count]) => ({ word, count }));
    }

    function buildSummary(sentences) { return sentences.slice(0, 3).map((s, i) => ({ id: i + 1, text: s })); }

    function buildQuiz(summaryKeywords, sentences) {
        const generatedQuizzes = [];
        let quizId = 1;
        summaryKeywords.slice(0, 3).forEach((keywordObj) => {
            const word = keywordObj.word;
            const targetSentence = sentences.find((s) => s.includes(word));
            if (targetSentence) {
                generatedQuizzes.push({
                    id: quizId++, type: "빈칸 채우기",
                    question: `다음 문장의 빈칸에 들어갈 알맞은 핵심 단어는?\n"${targetSentence.replace(new RegExp(word, 'g'), "[ ❓ ]")}"`,
                    answer: word, explanation: `원본 문장: ${targetSentence}`,
                });
            }
        });
        if (generatedQuizzes.length === 0 && sentences.length > 0) {
            generatedQuizzes.push({
                id: quizId++, type: "OX", question: `강의 내용 중에 다음 내용이 언급되었다.\n"${sentences[0]}"`,
                answer: "O", explanation: `실제 강의 텍스트에 포함된 문장입니다.`,
            });
        }
        return generatedQuizzes;
    }

    function handleGenerate() {
        const newKeywords = extractKeywords(rawText);
        const newNotes = buildSummary(sentenceList);
        const newQuiz = buildQuiz(newKeywords, sentenceList);
        setKeywords(newKeywords); setNotes(newNotes); setQuiz(newQuiz); setGenerated(true); setAnswers({});
        setHistory((prev) => [{
            title: lectureTitle, createdAt: new Date().toLocaleString("ko-KR"),
            summaryCount: newNotes.length, quizCount: newQuiz.length,
            savedRawText: rawText, savedNotes: newNotes, savedKeywords: newKeywords, savedQuiz: newQuiz,
        }, ...prev]);
    }

    function handleReset() {
        setRawText(""); setNotes([]); setKeywords([]); setQuiz([]); setGenerated(false); setAnswers({}); setAudioUrl(""); setRecordingStatus("녹음 대기 중");
    }

    function grade() {
        let correct = 0;
        quiz.forEach((q) => {
            if ((answers[q.id] || "").trim().toUpperCase() && q.answer.trim().toUpperCase().includes((answers[q.id] || "").trim().toUpperCase())) correct += 1;
        });
        return { correct, total: quiz.length, score: quiz.length ? Math.round((correct / quiz.length) * 100) : 0 };
    }
    const result = grade();

    function gradeSavedQuiz() {
        if (!selectedHistory) return { correct: 0, total: 0, score: 0 };
        let correct = 0;
        selectedHistory.savedQuiz.forEach((q) => {
            if ((answers[q.id] || "").trim().toUpperCase() && q.answer.trim().toUpperCase().includes((answers[q.id] || "").trim().toUpperCase())) correct += 1;
        });
        return { correct, total: selectedHistory.savedQuiz.length, score: selectedHistory.savedQuiz.length ? Math.round((correct / selectedHistory.savedQuiz.length) * 100) : 0 };
    }
    const savedResult = gradeSavedQuiz();

    const sendMessage = () => {
        if (!chatInput.trim() || !activeRoomId) return;
        const now = new Date();
        const dateString = now.toLocaleDateString("ko-KR", { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
        const timeString = now.toLocaleTimeString("ko-KR", { hour: '2-digit', minute: '2-digit' });
        const newMessage = { id: Date.now(), sender: "me", text: chatInput, date: dateString, time: timeString, readCount: 0 };

        setMessages(prev => ({ ...prev, [activeRoomId]: [...(prev[activeRoomId] || []), newMessage] }));
        setChatRooms(prev => prev.map(room => room.id === activeRoomId ? { ...room, lastMessage: chatInput, time: timeString } : room));
        setChatInput("");
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file || !activeRoomId) return;
        const now = new Date();
        const dateString = now.toLocaleDateString("ko-KR", { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
        const timeString = now.toLocaleTimeString("ko-KR", { hour: '2-digit', minute: '2-digit' });
        const newMessage = { id: Date.now(), sender: "me", type: "file", text: `📄 ${file.name}`, date: dateString, time: timeString, readCount: 0 };

        setMessages(prev => ({ ...prev, [activeRoomId]: [...(prev[activeRoomId] || []), newMessage] }));
        setChatRooms(prev => prev.map(room => room.id === activeRoomId ? { ...room, lastMessage: `파일: ${file.name}`, time: timeString } : room));
        e.target.value = "";
    };

    const handleRoomClick = (roomId) => {
        setActiveRoomId(roomId);
        setShowInviteMenu(false);
        setChatRooms(prev => prev.map(room => room.id === roomId ? { ...room, unread: 0 } : room));
    };

    const handleFriendClick = (friend) => {
        const existingRoom = chatRooms.find(r => r.type === "individual" && r.participants.includes(friend.id));
        if (existingRoom) {
            handleRoomClick(existingRoom.id);
        } else {
            const newRoomId = Date.now();
            const now = new Date();
            const dateString = now.toLocaleDateString("ko-KR", { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

            setChatRooms(prev => [{ id: newRoomId, type: "individual", name: friend.name, participants: [friend.id], lastMessage: "새로운 대화를 시작하세요.", time: "방금", unread: 0 }, ...prev]);

            setMessages(prev => ({ ...prev, [newRoomId]: [{ id: 1, sender: "system", isDateOnly: true, date: dateString, time: "방금" }] }));
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
        const dateString = now.toLocaleDateString("ko-KR", { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
        const timeString = now.toLocaleTimeString("ko-KR", { hour: '2-digit', minute: '2-digit' });

        const invitedNames = selectedFriends.map(id => friends.find(f => f.id === id).name).join(', ');
        const roomName = selectedFriends.map(id => friends.find(f => f.id === id).name).join(', ');
        const roomType = selectedFriends.length === 1 ? "individual" : "group";

        setChatRooms(prev => [{ id: newRoomId, type: roomType, name: roomName, participants: selectedFriends, lastMessage: "새로운 채팅방이 개설되었습니다.", time: timeString, unread: 0 }, ...prev]);
        setMessages(prev => ({
            ...prev,
            [newRoomId]: [
                { id: 1, sender: "system", text: `${myProfile.name}님이 ${invitedNames}님을 초대했습니다.`, date: dateString, time: timeString }
            ]
        }));

        handleRoomClick(newRoomId);
        setShowGroupCreate(false);
        setSelectedFriends([]);
    };

    // 💡 방 초대 시 방 이름 업데이트 로직 수정 완벽 적용
    const handleInviteFriends = () => {
        if (selectedFriends.length === 0) {
            setShowInviteMenu(false);
            return;
        }
        const now = new Date();
        const dateString = now.toLocaleDateString("ko-KR", { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
        const timeString = now.toLocaleTimeString("ko-KR", { hour: '2-digit', minute: '2-digit' });

        const invitedNames = selectedFriends.map(id => friends.find(f => f.id === id).name).join(', ');

        setChatRooms(prev => prev.map(r => {
            if (r.id === activeRoomId) {
                // 1:1 방이거나, 방 이름에 이미 쉼표가 들어간 나열식 방이라면 새 이름을 이어 붙입니다!
                const newName = r.type === 'individual' || r.name.includes(',') ? `${r.name}, ${invitedNames}` : r.name;
                return {
                    ...r,
                    type: 'group', // 무조건 단체방으로 전환
                    name: newName, // 💡 새로 조합한 이름 저장!
                    participants: [...r.participants, ...selectedFriends]
                };
            }
            return r;
        }));

        setMessages(prev => ({
            ...prev,
            [activeRoomId]: [...(prev[activeRoomId] || []), {
                id: Date.now(), sender: "system", text: `${myProfile.name}님이 ${invitedNames}님을 초대했습니다.`, date: dateString, time: timeString
            }]
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
        setMyProfile({ name: editName, status: editStatus, icon: editIcon || "👽" });
        setIsEditingProfile(false);
    };

    const activeRoom = chatRooms.find(r => r.id === activeRoomId);

    return (
        <div className="app">
            <div className="container" style={{ paddingBottom: '100px' }}>
                <div className="card">
                    <div className="headerRow">
                        <div>
                            <h1>AI 기반 실시간 강의 요약 및 퀴즈 생성 웹</h1>
                            <p className="subText">캡스톤 발표용 구현 프로토타입 — 텍스트 입력 기반 요약 / 키워드 추출 / 퀴즈 생성</p>
                        </div>
                        <div className="badge">구현 범위: 강의 입력 · 요약 · 키워드 · 퀴즈</div>
                    </div>
                </div>

                {currentScreen === "home" && (
                    <div className="card">
                        <button onClick={() => { handleReset(); setCurrentScreen("recording"); }} className="primaryBtn" style={{ width: '100%', padding: '20px', fontSize: '1.2rem', marginBottom: '30px', fontWeight: 'bold' }}>
                            + 새로운 강의 녹음 생성
                        </button>
                        <h2>나의 강의 목록</h2>
                        <div className="list">
                            {history.length === 0 ? <p className="emptyText">아직 기록된 강의가 없습니다. 새로운 녹음을 시작해보세요!</p> : (
                                history.map((item, idx) => (
                                    <div key={idx} className="itemBox" style={{ cursor: 'pointer', transition: 'background-color 0.2s' }}
                                        onClick={() => { setSelectedHistory(item); setAnswers({}); setCurrentScreen("detail"); }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}>
                                        <div className="historyTitle" style={{ color: '#212529', fontWeight: 'bold' }}>{item.title}</div>
                                        <div className="dateText">{item.createdAt}</div>
                                        <div className="historyMeta">요약 {item.summaryCount}개 · 퀴즈 {item.quizCount}개</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {currentScreen === "recording" && (
                    <>
                        <div style={{ marginBottom: '15px' }}><button onClick={() => setCurrentScreen("home")} className="secondaryBtn">← 홈으로 돌아가기</button></div>
                        <div className="grid">
                            <div>
                                <div className="card">
                                    <h2>1. 강의 내용 입력</h2>
                                    <input className="input" value={lectureTitle} onChange={(e) => setLectureTitle(e.target.value)} placeholder="강의 제목" />
                                    <textarea className="textarea" value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder="강의 텍스트 또는 STT 결과를 입력하세요" />
                                    <div className="buttonRow">
                                        <button onClick={handleStartRecording} disabled={isRecording} className="primaryBtn">녹음 시작</button>
                                        <button onClick={handleStopRecording} disabled={!isRecording} className="secondaryBtn">녹음 종료</button>
                                        <button onClick={handleGenerate} className="primaryBtn">요약/퀴즈 생성</button>
                                        <button onClick={handleReset} className="secondaryBtn">초기화</button>
                                    </div>
                                    <div className="statusBox">
                                        <div className="smallTitle">녹음 상태</div><div>{recordingStatus}</div>
                                        {audioUrl && (<><div className="smallTitle playbackTitle">녹음 파일 재생</div><audio controls src={audioUrl} className="audioPlayer" /></>)}
                                    </div>
                                </div>
                                <div className="card">
                                    <h2>2. 강의 요약 결과</h2>
                                    {!generated ? <p className="emptyText">아직 생성된 결과가 없습니다.</p> : (
                                        <div className="list">{notes.map((note) => (<div key={note.id} className="itemBox"><div className="smallTitle">핵심 요약 {note.id}</div><div>{note.text}</div></div>))}</div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <div className="card">
                                    <h2>3. 핵심 키워드</h2>
                                    <div className="keywordWrap">{keywords.length === 0 ? <p className="emptyText">생성 버튼을 누르면 키워드가 표시됩니다.</p> : keywords.map((item) => (<div key={item.word} className="keyword">{item.word} <span className="count">x{item.count}</span></div>))}</div>
                                </div>
                                <div className="card">
                                    <h2>4. 복습 퀴즈</h2>
                                    <div className="list">{quiz.length === 0 ? <p className="emptyText">요약을 생성하면 퀴즈가 자동 생성됩니다.</p> : quiz.map((q) => (
                                        <div key={q.id} className="itemBox"><div className="smallTitle">{q.type} 문제 {q.id}</div><div className="question">{q.question}</div>
                                            <input className="input" value={answers[q.id] || ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} placeholder="답 입력" /><div className="hint">정답 예시: {q.answer}</div></div>
                                    ))}</div>
                                    {quiz.length > 0 && <div className="scoreBox"><div className="scoreTitle">현재 점수</div><div>{result.correct} / {result.total} 정답 · {result.score}점</div></div>}
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {currentScreen === "detail" && selectedHistory && (
                    <>
                        <div style={{ marginBottom: '15px' }}><button onClick={() => setCurrentScreen("home")} className="secondaryBtn">← 목록으로 돌아가기</button></div>
                        <div className="card" style={{ marginBottom: '20px', backgroundColor: '#f8f9fa', border: '1px solid #e9ecef' }}><h2 style={{ margin: '0 0 10px 0', color: '#212529' }}>{selectedHistory.title}</h2><p className="subText" style={{ margin: 0 }}>생성 일시: {selectedHistory.createdAt}</p></div>
                        <div className="grid">
                            <div>
                                <div className="card"><h2>저장된 강의 내용</h2><div className="itemBox" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', backgroundColor: '#f8f9fa' }}>{selectedHistory.savedRawText || "저장된 내용이 없습니다."}</div></div>
                                <div className="card"><h2>저장된 강의 요약</h2><div className="list">{selectedHistory.savedNotes.map((note) => (<div key={note.id} className="itemBox"><div className="smallTitle">핵심 요약 {note.id}</div><div>{note.text}</div></div>))}</div></div>
                            </div>
                            <div>
                                <div className="card"><h2>저장된 핵심 키워드</h2><div className="keywordWrap">{selectedHistory.savedKeywords.map((item) => (<div key={item.word} className="keyword">{item.word} <span className="count">x{item.count}</span></div>))}</div></div>
                                <div className="card"><h2>다시 풀어보는 복습 퀴즈</h2>
                                    <div className="list">{selectedHistory.savedQuiz.map((q) => (<div key={q.id} className="itemBox"><div className="smallTitle">{q.type} 문제 {q.id}</div><div className="question">{q.question}</div><input className="input" value={answers[q.id] || ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} placeholder="답 입력" /><div className="hint">정답: {q.answer}</div></div>))}</div>
                                    <div className="scoreBox"><div className="scoreTitle">현재 점수</div><div>{savedResult.correct} / {savedResult.total} 정답 · {savedResult.score}점</div></div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* 💬 메신저 창 */}
            <div style={{ position: 'fixed', bottom: '30px', right: '30px', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>

                {isChatOpen && (
                    <div style={{
                        position: 'relative',
                        width: `${chatSize.width}px`,
                        height: `${chatSize.height}px`,
                        backgroundColor: '#ffffff', borderRadius: '16px',
                        boxShadow: '0 8px 30px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column',
                        overflow: 'hidden', marginBottom: '15px', border: '1px solid #e9ecef',
                        fontFamily: "'Pretendard', -apple-system, sans-serif"
                    }}>

                        {/* 사이즈 조절 핸들 */}
                        <div
                            onMouseDown={(e) => { e.preventDefault(); setResizing(true); }}
                            style={{
                                position: 'absolute', top: 0, left: 0, width: '25px', height: '25px',
                                cursor: 'nwse-resize', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start'
                            }}
                        >
                            <svg viewBox="0 0 10 10" style={{ width: '12px', height: '12px', fill: '#adb5bd', opacity: 0.5 }}>
                                <polygon points="0,0 10,0 0,10" />
                            </svg>
                        </div>

                        {/* 헤더 */}
                        <div style={{
                            backgroundColor: '#ffffff', color: '#212529', padding: '16px 20px', paddingLeft: '35px',
                            borderBottom: '1px solid #f1f3f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                            {activeRoomId ? (
                                <button onClick={() => { setActiveRoomId(null); setShowInviteMenu(false); }} style={{ background: 'none', border: 'none', fontSize: '1rem', color: '#495057', cursor: 'pointer', padding: 0 }}>
                                    ←
                                </button>
                            ) : (
                                <div style={{ fontWeight: 'bold', fontSize: '1.1rem', letterSpacing: '0.5px' }}>WORKSPACE</div>
                            )}

                            <div style={{ fontWeight: '600', fontSize: '1rem', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '150px' }}>
                                {activeRoomId ? activeRoom?.name : (showGroupCreate ? '새로운 채팅방' : '')}
                            </div>

                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                {activeRoomId && (
                                    <button onClick={() => { setShowInviteMenu(true); setSelectedFriends([]); }} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#868e96', padding: 0 }}>
                                        👤+
                                    </button>
                                )}
                                <button onClick={() => setIsChatOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#868e96', padding: 0, lineHeight: 1 }}>×</button>
                            </div>
                        </div>

                        {!activeRoomId ? (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                                {showGroupCreate ? (
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#fff' }}>
                                        <div style={{ padding: '10px 20px', fontSize: '0.85rem', color: '#adb5bd', fontWeight: 'bold' }}>대화상대 선택</div>
                                        <div style={{ flex: 1, overflowY: 'auto' }}>
                                            {friends.map(f => (
                                                <label key={f.id} style={{ display: 'flex', padding: '12px 20px', alignItems: 'center', cursor: 'pointer', borderBottom: '1px solid #f8f9fa' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedFriends.includes(f.id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) setSelectedFriends([...selectedFriends, f.id]);
                                                            else setSelectedFriends(selectedFriends.filter(id => id !== f.id));
                                                        }}
                                                        style={{ width: '18px', height: '18px', accentColor: '#4b8a66', marginRight: '15px' }}
                                                    />
                                                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#f1f3f5', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.1rem', marginRight: '12px' }}>👤</div>
                                                    <span style={{ fontWeight: 'bold', color: '#343a40' }}>{f.name}</span>
                                                </label>
                                            ))}
                                        </div>
                                        <div style={{ padding: '15px 20px', borderTop: '1px solid #f1f3f5', display: 'flex', gap: '10px' }}>
                                            <button onClick={() => setShowGroupCreate(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #dee2e6', background: '#fff', cursor: 'pointer', fontWeight: 'bold', color: '#495057' }}>취소</button>
                                            <button onClick={handleCreateGroup} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: '#4b8a66', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>초대하기</button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {/* 친구 탭 */}
                                        {chatTab === 'friends' && (
                                            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>

                                                <div style={{ padding: '10px 20px', fontSize: '0.85rem', color: '#adb5bd', fontWeight: 'bold' }}>내 프로필</div>

                                                {isEditingProfile ? (
                                                    <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f3f5', marginBottom: '10px', backgroundColor: '#f8f9fa' }}>
                                                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                                            <input
                                                                value={editIcon} onChange={(e) => setEditIcon(e.target.value)} maxLength={2}
                                                                style={{ width: '40px', textAlign: 'center', borderRadius: '8px', border: '1px solid #dee2e6', padding: '4px' }}
                                                                placeholder="이모지"
                                                            />
                                                            <input
                                                                value={editName} onChange={(e) => setEditName(e.target.value)}
                                                                style={{ flex: 1, padding: '4px 8px', borderRadius: '8px', border: '1px solid #dee2e6' }}
                                                                placeholder="이름"
                                                            />
                                                        </div>
                                                        <input
                                                            value={editStatus} onChange={(e) => setEditStatus(e.target.value)}
                                                            style={{ width: '100%', padding: '6px 8px', borderRadius: '8px', border: '1px solid #dee2e6', marginBottom: '8px', boxSizing: 'border-box' }}
                                                            placeholder="상태 메시지"
                                                        />
                                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                                                            <button onClick={() => setIsEditingProfile(false)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #dee2e6', background: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>취소</button>
                                                            <button onClick={handleEditProfileSave} style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: '#4b8a66', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>저장</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', padding: '12px 20px', alignItems: 'center', borderBottom: '1px solid #f1f3f5', marginBottom: '10px' }}>
                                                        <div style={{ width: '56px', height: '56px', borderRadius: '18px', backgroundColor: '#4b8a66', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.6rem', marginRight: '15px', boxShadow: '0 4px 10px rgba(75, 138, 102, 0.2)' }}>
                                                            {myProfile.icon}
                                                        </div>
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontWeight: 'bold', fontSize: '1.15rem', color: '#212529', marginBottom: '4px' }}>{myProfile.name}</div>
                                                            <div style={{ fontSize: '0.85rem', color: '#868e96' }}>{myProfile.status}</div>
                                                        </div>
                                                        <button onClick={handleEditProfileOpen} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#adb5bd', padding: '4px', fontSize: '1.1rem' }}>✏️</button>
                                                    </div>
                                                )}

                                                <div style={{ padding: '10px 20px', fontSize: '0.85rem', color: '#adb5bd', fontWeight: 'bold' }}>내 친구 ({friends.length})</div>
                                                {friends.map((friend) => (
                                                    <div key={friend.id} onClick={() => handleFriendClick(friend)}
                                                        style={{ display: 'flex', padding: '12px 20px', cursor: 'pointer', alignItems: 'center', transition: 'background 0.2s' }}
                                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                        <div style={{ width: '44px', height: '44px', borderRadius: '14px', backgroundColor: '#f1f3f5', color: '#495057', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.2rem', marginRight: '15px' }}>👤</div>
                                                        <div>
                                                            <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#343a40', marginBottom: '4px' }}>{friend.name}</div>
                                                            <div style={{ fontSize: '0.85rem', color: '#868e96' }}>{friend.status}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* 대화방 탭 */}
                                        {chatTab === 'chats' && (
                                            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 20px', alignItems: 'center' }}>
                                                    <div style={{ fontSize: '0.85rem', color: '#adb5bd', fontWeight: 'bold' }}>진행 중인 대화 ({chatRooms.length})</div>
                                                    <button onClick={() => { setShowGroupCreate(true); setSelectedFriends([]); }} style={{ background: 'none', border: 'none', color: '#4b8a66', fontWeight: 'bold', cursor: 'pointer' }}>+ 새로운 채팅</button>
                                                </div>

                                                {chatRooms.map((room) => (
                                                    <div key={room.id} onClick={() => handleRoomClick(room.id)}
                                                        style={{ display: 'flex', padding: '12px 20px', cursor: 'pointer', alignItems: 'center', transition: 'background 0.2s' }}
                                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                        <div style={{ width: '44px', height: '44px', borderRadius: '14px', backgroundColor: room.type === 'group' ? '#e9f2eb' : '#f1f3f5', color: room.type === 'group' ? '#3b7a57' : '#495057', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.2rem', marginRight: '15px' }}>
                                                            {room.type === 'group' ? '👥' : '👤'}
                                                        </div>
                                                        <div style={{ flex: 1, overflow: 'hidden' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                                <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#343a40', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>{room.name}</div>
                                                                <div style={{ fontSize: '0.75rem', color: '#adb5bd', flexShrink: 0 }}>{room.time}</div>
                                                            </div>
                                                            <div style={{ fontSize: '0.85rem', color: '#868e96', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {room.lastMessage}
                                                            </div>
                                                        </div>
                                                        {room.unread > 0 && (
                                                            <div style={{ backgroundColor: '#4b8a66', color: 'white', borderRadius: '6px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 'bold', marginLeft: '10px' }}>
                                                                {room.unread}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div style={{ display: 'flex', borderTop: '1px solid #f1f3f5', backgroundColor: '#ffffff' }}>
                                            <button onClick={() => setChatTab('friends')} style={{
                                                flex: 1, padding: '15px 0', border: 'none', background: 'none', cursor: 'pointer',
                                                color: chatTab === 'friends' ? '#212529' : '#adb5bd', fontWeight: chatTab === 'friends' ? 'bold' : 'normal', fontSize: '1rem'
                                            }}>
                                                👤 친구
                                            </button>
                                            <button onClick={() => setChatTab('chats')} style={{
                                                flex: 1, padding: '15px 0', border: 'none', background: 'none', cursor: 'pointer',
                                                color: chatTab === 'chats' ? '#212529' : '#adb5bd', fontWeight: chatTab === 'chats' ? 'bold' : 'normal', fontSize: '1rem'
                                            }}>
                                                💬 채팅방
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff' }}>

                                {showInviteMenu ? (
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#fff', zIndex: 50 }}>
                                        <div style={{ padding: '10px 20px', fontSize: '0.85rem', color: '#adb5bd', fontWeight: 'bold' }}>초대할 친구 선택</div>
                                        <div style={{ flex: 1, overflowY: 'auto' }}>
                                            {friends.filter(f => !activeRoom.participants.includes(f.id)).map(f => (
                                                <label key={f.id} style={{ display: 'flex', padding: '12px 20px', alignItems: 'center', cursor: 'pointer', borderBottom: '1px solid #f8f9fa' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedFriends.includes(f.id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) setSelectedFriends([...selectedFriends, f.id]);
                                                            else setSelectedFriends(selectedFriends.filter(id => id !== f.id));
                                                        }}
                                                        style={{ width: '18px', height: '18px', accentColor: '#4b8a66', marginRight: '15px' }}
                                                    />
                                                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#f1f3f5', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.1rem', marginRight: '12px' }}>👤</div>
                                                    <span style={{ fontWeight: 'bold', color: '#343a40' }}>{f.name}</span>
                                                </label>
                                            ))}
                                            {friends.filter(f => !activeRoom.participants.includes(f.id)).length === 0 && (
                                                <div style={{ padding: '30px', textAlign: 'center', color: '#adb5bd' }}>더 이상 초대할 친구가 없습니다.</div>
                                            )}
                                        </div>
                                        <div style={{ padding: '15px 20px', borderTop: '1px solid #f1f3f5', display: 'flex', gap: '10px' }}>
                                            <button onClick={() => setShowInviteMenu(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #dee2e6', background: '#fff', cursor: 'pointer', fontWeight: 'bold', color: '#495057' }}>취소</button>
                                            <button onClick={handleInviteFriends} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: '#4b8a66', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>초대하기</button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                            {(messages[activeRoomId] || []).map((msg, index, arr) => {
                                                const showDateDivider = index === 0 || msg.date !== arr[index - 1].date;

                                                return (
                                                    <React.Fragment key={msg.id}>
                                                        {showDateDivider && (
                                                            <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
                                                                <div style={{ backgroundColor: '#f1f3f5', color: '#868e96', fontSize: '0.75rem', padding: '4px 14px', borderRadius: '20px' }}>
                                                                    {msg.date || "오늘"}
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: msg.sender === 'me' ? 'flex-end' : msg.sender === 'system' ? 'center' : 'flex-start' }}>
                                                            {msg.sender === 'system' ? (
                                                                !msg.isDateOnly && <div style={{ fontSize: '0.75rem', color: '#868e96', margin: '10px 0', backgroundColor: '#f8f9fa', padding: '4px 12px', borderRadius: '12px' }}>{msg.text}</div>
                                                            ) : (
                                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: msg.sender === 'me' ? 'flex-end' : 'flex-start' }}>
                                                                    {msg.sender === 'other' && msg.senderName && (
                                                                        <div style={{ fontSize: '0.8rem', color: '#495057', marginBottom: '4px', marginLeft: '4px', fontWeight: 'bold' }}>
                                                                            {msg.senderName}
                                                                        </div>
                                                                    )}

                                                                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', flexDirection: msg.sender === 'me' ? 'row' : 'row-reverse' }}>

                                                                        {msg.sender === 'me' ? (
                                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginBottom: '2px' }}>
                                                                                {msg.readCount > 0 && (
                                                                                    <div style={{ fontSize: '0.65rem', fontWeight: 'bold', marginBottom: '2px', color: '#4b8a66' }}>
                                                                                        {activeRoom?.type === 'individual' ? '읽음' : `${msg.readCount}명 읽음`}
                                                                                    </div>
                                                                                )}
                                                                                <div style={{ fontSize: '0.7rem', color: '#ced4da' }}>{msg.time}</div>
                                                                            </div>
                                                                        ) : (
                                                                            <div style={{ fontSize: '0.7rem', color: '#ced4da', marginBottom: '2px' }}>{msg.time}</div>
                                                                        )}

                                                                        <div style={{
                                                                            maxWidth: '220px', padding: '10px 14px', wordBreak: 'break-word',
                                                                            backgroundColor: msg.sender === 'me' ? '#4b8a66' : '#f1f3f5',
                                                                            color: msg.sender === 'me' ? '#fff' : '#343a40',
                                                                            border: msg.sender === 'me' ? 'none' : '1px solid #e9ecef',
                                                                            borderRadius: msg.sender === 'me' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                                                                            fontSize: '0.9rem', lineHeight: '1.4',
                                                                            cursor: msg.type === 'file' ? 'pointer' : 'default', textDecoration: msg.type === 'file' ? 'underline' : 'none'
                                                                        }}>
                                                                            {msg.text}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </React.Fragment>
                                                );
                                            })}
                                        </div>

                                        <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelect} />

                                        <div style={{ padding: '12px 16px', backgroundColor: '#ffffff', borderTop: '1px solid #f1f3f5', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <button onClick={() => fileInputRef.current.click()} style={{
                                                background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#adb5bd', padding: '0 4px'
                                            }}>
                                                📎
                                            </button>
                                            <input
                                                type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                                                placeholder="메시지 입력..."
                                                style={{
                                                    flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid #e9ecef',
                                                    outline: 'none', fontSize: '0.9rem', backgroundColor: '#f8f9fa', color: '#212529'
                                                }}
                                            />
                                            <button onClick={sendMessage} style={{
                                                backgroundColor: '#4b8a66', color: 'white', border: 'none', borderRadius: '8px',
                                                padding: '0 16px', height: '38px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem'
                                            }}>
                                                전송
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <button
                    onClick={() => setIsChatOpen(!isChatOpen)}
                    style={{
                        width: '64px', height: '64px', borderRadius: '20px', backgroundColor: '#4b8a66',
                        color: '#ffffff', border: 'none', fontSize: '1.8rem', cursor: 'pointer',
                        boxShadow: '0 6px 16px rgba(75, 138, 102, 0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center',
                        transition: 'transform 0.2s, backgroundColor 0.2s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.backgroundColor = '#3b7a57'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.backgroundColor = '#4b8a66'; }}
                >
                    {isChatOpen ? '×' : '💬'}
                </button>
            </div>
        </div>
    );
}