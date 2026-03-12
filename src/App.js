export default function LectureAIPrototype() {
    const { useEffect, useMemo, useRef, useState } = React;

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
                const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
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
        "은", "는", "이", "가", "을", "를", "에", "의", "과", "와", "도", "으로", "에서", "하다", "하는", "하고", "한다", "있다", "주어진", "대표적인", "반복적으로", "위해", "함수는", "방법이다", "기술이다"
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
                explanation: "강의 본문에서 비용 함수는 예측값과 실제값의 차이를 수치화한다고 설명했습니다.",
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

    function grade() {
        let correct = 0;
        quiz.forEach((q) => {
            const userAnswer = (answers[q.id] || "").trim().toUpperCase();
            const realAnswer = q.answer.trim().toUpperCase();
            if (userAnswer && realAnswer.includes(userAnswer)) correct += 1;
        });
        return { correct, total: quiz.length, score: quiz.length ? Math.round((correct / quiz.length) * 100) : 0 };
    }

    const result = grade();

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="mx-auto max-w-6xl space-y-6">
                <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900">AI 기반 실시간 강의 요약 및 퀴즈 생성 앱</h1>
                            <p className="mt-2 text-slate-600">캡스톤 발표용 부분 구현 프로토타입 — 텍스트 입력 기반 요약 / 키워드 추출 / 퀴즈 생성</p>
                        </div>
                        <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
                            구현 범위: 강의 입력 · 요약 · 키워드 · 퀴즈
                        </div>
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="space-y-6">
                        <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
                            <h2 className="text-xl font-semibold text-slate-900">1. 강의 내용 입력</h2>
                            <p className="mt-1 text-sm text-slate-600">실제 STT 대신 발표 시연이 가능하도록 강의 텍스트 입력과 브라우저 녹음 기능을 함께 구현했습니다.</p>
                            <input
                                className="mt-4 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-slate-300"
                                value={lectureTitle}
                                onChange={(e) => setLectureTitle(e.target.value)}
                                placeholder="강의 제목"
                            />
                            <textarea
                                className="mt-4 h-64 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-slate-300"
                                value={rawText}
                                onChange={(e) => setRawText(e.target.value)}
                                placeholder="강의 텍스트 또는 STT 결과를 입력하세요"
                            />
                            <div className="mt-4 flex gap-3 flex-wrap">
                                <button
                                    onClick={handleStartRecording}
                                    disabled={isRecording}
                                    className="rounded-2xl bg-slate-900 px-5 py-3 text-white shadow-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    녹음 시작
                                </button>
                                <button
                                    onClick={handleStopRecording}
                                    disabled={!isRecording}
                                    className="rounded-2xl border border-slate-300 px-5 py-3 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    녹음 종료
                                </button>
                                <button
                                    onClick={handleGenerate}
                                    className="rounded-2xl bg-slate-900 px-5 py-3 text-white shadow-sm hover:opacity-90"
                                >
                                    요약/퀴즈 생성
                                </button>
                                <button
                                    onClick={() => {
                                        setRawText("");
                                        setNotes([]);
                                        setKeywords([]);
                                        setQuiz([]);
                                        setGenerated(false);
                                        setAnswers({});
                                        setAudioUrl("");
                                        setRecordingStatus("녹음 대기 중");
                                    }}
                                    className="rounded-2xl border border-slate-300 px-5 py-3 text-slate-700 hover:bg-slate-50"
                                >
                                    초기화
                                </button>
                            </div>

                            <div className="mt-4 rounded-2xl bg-slate-50 p-4 border border-slate-200">
                                <div className="text-sm font-semibold text-slate-500">녹음 상태</div>
                                <div className="mt-1 text-slate-700">{recordingStatus}</div>
                                {audioUrl && (
                                    <>
                                        <div className="mt-4 text-sm font-semibold text-slate-500">녹음 파일 재생</div>
                                        <audio controls src={audioUrl} className="mt-2 w-full" />
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
                            <h2 className="text-xl font-semibold text-slate-900">2. 강의 요약 결과</h2>
                            {!generated ? (
                                <p className="mt-3 text-slate-500">아직 생성된 결과가 없습니다.</p>
                            ) : (
                                <div className="mt-4 space-y-3">
                                    {notes.map((note) => (
                                        <div key={note.id} className="rounded-2xl bg-slate-50 p-4 text-slate-800 border border-slate-200">
                                            <div className="text-sm font-semibold text-slate-500">핵심 요약 {note.id}</div>
                                            <div className="mt-1 leading-7">{note.text}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
                            <h2 className="text-xl font-semibold text-slate-900">3. 핵심 키워드</h2>
                            <div className="mt-4 flex flex-wrap gap-3">
                                {keywords.length === 0 ? (
                                    <p className="text-slate-500">생성 버튼을 누르면 키워드가 표시됩니다.</p>
                                ) : (
                                    keywords.map((item) => (
                                        <div key={item.word} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 border border-slate-200">
                                            {item.word} <span className="text-slate-500">x{item.count}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
                            <h2 className="text-xl font-semibold text-slate-900">4. 복습 퀴즈</h2>
                            <div className="mt-4 space-y-4">
                                {quiz.length === 0 ? (
                                    <p className="text-slate-500">요약을 생성하면 퀴즈가 자동 생성됩니다.</p>
                                ) : (
                                    quiz.map((q) => (
                                        <div key={q.id} className="rounded-2xl border border-slate-200 p-4">
                                            <div className="text-sm font-semibold text-slate-500">{q.type} 문제 {q.id}</div>
                                            <div className="mt-1 font-medium text-slate-900">{q.question}</div>
                                            <input
                                                className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-300"
                                                value={answers[q.id] || ""}
                                                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                                                placeholder={q.type === "OX" ? "O 또는 X 입력" : "답 입력"}
                                            />
                                            <div className="mt-2 text-sm text-slate-500">정답 예시: {q.answer}</div>
                                        </div>
                                    ))
                                )}
                            </div>
                            {quiz.length > 0 && (
                                <div className="mt-5 rounded-2xl bg-slate-50 p-4 border border-slate-200">
                                    <div className="font-semibold text-slate-800">현재 점수</div>
                                    <div className="mt-1 text-slate-700">{result.correct} / {result.total} 정답 · {result.score}점</div>
                                </div>
                            )}
                        </div>

                        <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
                            <h2 className="text-xl font-semibold text-slate-900">5. 생성 이력</h2>
                            <div className="mt-4 space-y-3">
                                {history.length === 0 ? (
                                    <p className="text-slate-500">아직 생성 이력이 없습니다.</p>
                                ) : (
                                    history.map((item, idx) => (
                                        <div key={idx} className="rounded-2xl bg-slate-50 p-4 border border-slate-200">
                                            <div className="font-medium text-slate-900">{item.title}</div>
                                            <div className="mt-1 text-sm text-slate-600">{item.createdAt}</div>
                                            <div className="mt-2 text-sm text-slate-700">요약 {item.summaryCount}개 · 퀴즈 {item.quizCount}개</div>
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
