import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

export default function App() {
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

    useEffect(() => {
        return () => {
            if (audioUrl) {
                URL.revokeObjectURL(audioUrl);
            }
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
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, {
                    type: "audio/webm",
                });
                const url = URL.createObjectURL(audioBlob);
                setAudioUrl(url);
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
        "은", "는", "이", "가", "을", "를", "에", "의", "과", "와", "도",
        "으로", "에서", "하다", "하는", "하고", "한다", "있다", "주어진",
        "대표적인", "반복적으로", "위해", "함수는", "방법이다", "기술이다",
    ]);

    const sentenceList = useMemo(() => {
        return rawText
            .split(/(?<=[.!?다])\s+/)
            .map((s) => s.trim())
            .filter(Boolean);
    }, [rawText]);

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
        return sentences.slice(0, 3).map((s, i) => ({
            id: i + 1,
            text: s,
        }));
    }

    function buildQuiz(summaryKeywords, sentences) {
        const base = summaryKeywords.slice(0, 3).map((item, idx) => ({
            id: idx + 1,
            type: "OX",
            question: `${item.word}은(는) 강의 핵심 개념에 포함된다.`,
            answer: "O",
            explanation: `${item.word}은(는) 요약 키워드로 추출된 핵심 개념입니다.`,
        }));

        if (sentences[0]) {
            base.push({
                id: base.length + 1,
                type: "주관식",
                question: "강의에서 설명한 비용 함수의 역할을 한 줄로 적어보세요.",
                answer: "예측값과 실제값의 차이를 수치화한다",
                explanation:
                    "강의 본문에서 비용 함수는 예측값과 실제값의 차이를 수치화한다고 설명했습니다.",
            });
        }

        return base;
    }

    function handleGenerate() {
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
            },
            ...prev,
        ]);
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
            const userAnswer = (answers[q.id] || "").trim().toUpperCase();
            const realAnswer = q.answer.trim().toUpperCase();
            if (userAnswer && realAnswer.includes(userAnswer)) correct += 1;
        });

        return {
            correct,
            total: quiz.length,
            score: quiz.length ? Math.round((correct / quiz.length) * 100) : 0,
        };
    }

    const result = grade();

    return (
        <div className="app">
            <div className="container">
                <div className="card">
                    <div className="headerRow">
                        <div>
                            <h1>AI 기반 실시간 강의 요약 및 퀴즈 생성 앱</h1>
                            <p className="subText">
                                캡스톤 발표용 부분 구현 프로토타입 — 텍스트 입력 기반 요약 / 키워드 추출 / 퀴즈 생성
                            </p>
                        </div>
                        <div className="badge">구현 범위: 강의 입력 · 요약 · 키워드 · 퀴즈</div>
                    </div>
                </div>

                <div className="grid">
                    <div>
                        <div className="card">
                            <h2>1. 강의 내용 입력</h2>
                            <p className="subText">텍스트 입력과 브라우저 녹음 기능을 함께 구현했습니다.</p>

                            <input
                                className="input"
                                value={lectureTitle}
                                onChange={(e) => setLectureTitle(e.target.value)}
                                placeholder="강의 제목"
                            />

                            <textarea
                                className="textarea"
                                value={rawText}
                                onChange={(e) => setRawText(e.target.value)}
                                placeholder="강의 텍스트 또는 STT 결과를 입력하세요"
                            />

                            <div className="buttonRow">
                                <button onClick={handleStartRecording} disabled={isRecording} className="primaryBtn">
                                    녹음 시작
                                </button>

                                <button onClick={handleStopRecording} disabled={!isRecording} className="secondaryBtn">
                                    녹음 종료
                                </button>

                                <button onClick={handleGenerate} className="primaryBtn">
                                    요약/퀴즈 생성
                                </button>

                                <button onClick={handleReset} className="secondaryBtn">
                                    초기화
                                </button>
                            </div>

                            <div className="statusBox">
                                <div className="smallTitle">녹음 상태</div>
                                <div>{recordingStatus}</div>

                                {audioUrl && (
                                    <>
                                        <div className="smallTitle playbackTitle">녹음 파일 재생</div>
                                        <audio controls src={audioUrl} className="audioPlayer" />
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="card">
                            <h2>2. 강의 요약 결과</h2>
                            {!generated ? (
                                <p className="emptyText">아직 생성된 결과가 없습니다.</p>
                            ) : (
                                <div className="list">
                                    {notes.map((note) => (
                                        <div key={note.id} className="itemBox">
                                            <div className="smallTitle">핵심 요약 {note.id}</div>
                                            <div>{note.text}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <div className="card">
                            <h2>3. 핵심 키워드</h2>
                            <div className="keywordWrap">
                                {keywords.length === 0 ? (
                                    <p className="emptyText">생성 버튼을 누르면 키워드가 표시됩니다.</p>
                                ) : (
                                    keywords.map((item) => (
                                        <div key={item.word} className="keyword">
                                            {item.word} <span className="count">x{item.count}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="card">
                            <h2>4. 복습 퀴즈</h2>
                            <div className="list">
                                {quiz.length === 0 ? (
                                    <p className="emptyText">요약을 생성하면 퀴즈가 자동 생성됩니다.</p>
                                ) : (
                                    quiz.map((q) => (
                                        <div key={q.id} className="itemBox">
                                            <div className="smallTitle">{q.type} 문제 {q.id}</div>
                                            <div className="question">{q.question}</div>
                                            <input
                                                className="input"
                                                value={answers[q.id] || ""}
                                                onChange={(e) =>
                                                    setAnswers({ ...answers, [q.id]: e.target.value })
                                                }
                                                placeholder={q.type === "OX" ? "O 또는 X 입력" : "답 입력"}
                                            />
                                            <div className="hint">정답 예시: {q.answer}</div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {quiz.length > 0 && (
                                <div className="scoreBox">
                                    <div className="scoreTitle">현재 점수</div>
                                    <div>
                                        {result.correct} / {result.total} 정답 · {result.score}점
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="card">
                            <h2>5. 생성 이력</h2>
                            <div className="list">
                                {history.length === 0 ? (
                                    <p className="emptyText">아직 생성 이력이 없습니다.</p>
                                ) : (
                                    history.map((item, idx) => (
                                        <div key={idx} className="itemBox">
                                            <div className="historyTitle">{item.title}</div>
                                            <div className="dateText">{item.createdAt}</div>
                                            <div className="historyMeta">
                                                요약 {item.summaryCount}개 · 퀴즈 {item.quizCount}개
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}