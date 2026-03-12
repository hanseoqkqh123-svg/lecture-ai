import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

export default function App() {
    const [lectureTitle, setLectureTitle] = useState("머신러닝 개론 1주차");
    const [rawText, setRawText] = useState(
        "머신러닝은 데이터로부터 패턴을 학습하는 기술이다. 지도학습은 입력과 정답이 함께 주어진 데이터를 사용한다. 선형회귀는 연속적인 값을 예측하는 대표적인 지도학습 방법이다. 비용 함수는 예측값과 실제값의 차이를 수치화한다. 경사하강법은 비용 함수를 최소화하기 위해 파라미터를 반복적으로 갱신하는 방법이다."
    );
    const [notes, setNotes] = useState([]);
    const [keywords, setKeywords] = useState([]);
    const [quiz, setQuiz] = useState([]);
    const [history, setHistory] = useState([]);
    const [answers, setAnswers] = useState({});
    const [generated, setGenerated] = useState(false);

    const [isListening, setIsListening] = useState(false);
    const [speechSupported, setSpeechSupported] = useState(true);
    const [recognitionStatus, setRecognitionStatus] = useState("대기 중");
    const [liveTranscript, setLiveTranscript] = useState("");

    const recognitionRef = useRef(null);
    const finalTranscriptRef = useRef("");

    const stopWords = new Set([
        "은", "는", "이", "가", "을", "를", "에", "의", "과", "와", "도",
        "으로", "에서", "하다", "하는", "하고", "한다", "있다", "주어진",
        "대표적인", "반복적으로", "위해", "함수는", "방법이다", "기술이다"
    ]);

    useEffect(() => {
        const SpeechRecognition =
            window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            setSpeechSupported(false);
            setRecognitionStatus("이 브라우저는 음성 인식을 지원하지 않습니다.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = "ko-KR";
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onstart = () => {
            setRecognitionStatus("음성 인식 중...");
            setIsListening(true);
        };

        recognition.onresult = (event) => {
            let finalText = finalTranscriptRef.current;
            let interimText = "";

            for (let i = event.resultIndex; i < event.results.length; i += 1) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalText += transcript + " ";
                } else {
                    interimText += transcript;
                }
            }

            finalTranscriptRef.current = finalText;
            const merged = `${finalText}${interimText}`.trim();
            setLiveTranscript(merged);
            setRawText(merged);
        };

        recognition.onerror = (event) => {
            if (event.error === "not-allowed") {
                setRecognitionStatus("마이크 권한이 거부되었습니다.");
            } else {
                setRecognitionStatus(`음성 인식 오류: ${event.error}`);
            }
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
            setRecognitionStatus("음성 인식 종료");
        };

        recognitionRef.current = recognition;

        return () => {
            recognition.stop();
        };
    }, []);

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

    function handleStartListening() {
        if (!recognitionRef.current || isListening) return;

        finalTranscriptRef.current = rawText ? `${rawText} ` : "";
        setLiveTranscript(rawText);

        try {
            recognitionRef.current.start();
        } catch (error) {
            setRecognitionStatus("음성 인식을 다시 시작할 수 없습니다. 잠시 후 다시 시도하세요.");
        }
    }

    function handleStopListening() {
        if (!recognitionRef.current || !isListening) return;
        recognitionRef.current.stop();
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
        setLiveTranscript("");
        finalTranscriptRef.current = "";
        if (recognitionRef.current && isListening) {
            recognitionRef.current.stop();
        }
        setRecognitionStatus(
            speechSupported ? "대기 중" : "이 브라우저는 음성 인식을 지원하지 않습니다."
        );
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
                                무료 Web Speech API 기반 음성 인식 + 텍스트 요약 / 키워드 추출 / 퀴즈 생성
                            </p>
                        </div>
                        <div className="badge">구현 범위: 음성 입력 · 요약 · 키워드 · 퀴즈</div>
                    </div>
                </div>

                <div className="grid">
                    <div>
                        <div className="card">
                            <h2>1. 강의 내용 입력</h2>
                            <p className="subText">
                                무료 Web Speech API를 사용해 브라우저에서 바로 음성 인식을 수행합니다.
                                Chrome 계열 브라우저에서 가장 잘 동작합니다.
                            </p>

                            <input
                                className="input"
                                value={lectureTitle}
                                onChange={(e) => setLectureTitle(e.target.value)}
                                placeholder="강의 제목"
                            />

                            <div className="buttonRow">
                                <button
                                    onClick={handleStartListening}
                                    disabled={!speechSupported || isListening}
                                    className="primaryBtn"
                                >
                                    음성 인식 시작
                                </button>

                                <button
                                    onClick={handleStopListening}
                                    disabled={!isListening}
                                    className="secondaryBtn"
                                >
                                    음성 인식 종료
                                </button>

                                <button onClick={handleGenerate} className="primaryBtn">
                                    요약/퀴즈 생성
                                </button>

                                <button onClick={handleReset} className="secondaryBtn">
                                    초기화
                                </button>
                            </div>

                            <div className="statusBox">
                                <div className="smallTitle">음성 인식 상태</div>
                                <div>{recognitionStatus}</div>

                                {liveTranscript && (
                                    <>
                                        <div className="smallTitle" style={{ marginTop: "12px" }}>
                                            실시간 인식 결과
                                        </div>
                                        <div style={{ marginTop: "8px", whiteSpace: "pre-wrap", lineHeight: "1.7" }}>
                                            {liveTranscript}
                                        </div>
                                    </>
                                )}
                            </div>

                            <textarea
                                className="textarea"
                                value={rawText}
                                onChange={(e) => setRawText(e.target.value)}
                                placeholder="강의 텍스트 또는 음성 인식 결과가 여기에 입력됩니다"
                            />
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