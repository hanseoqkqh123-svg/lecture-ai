import React, { useEffect, useState, useCallback } from "react";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

//유틸
function fmtDate(d) {
    if (!d) return "–";
    return new Date(d).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function Toast({ msg, onClose }) {
    useEffect(() => {
        if (!msg) return;
        const t = setTimeout(onClose, 3000);
        return () => clearTimeout(t);
    }, [msg, onClose]);
    if (!msg) return null;
    const isOk = msg.startsWith("✅");
    return (
        <div style={{
            position: "fixed", top: 24, right: 24, zIndex: 9999,
            padding: "14px 22px", borderRadius: 14,
            background: isOk ? "#f0fdf4" : "#fef2f2",
            border: `1.5px solid ${isOk ? "#86efac" : "#fca5a5"}`,
            color: isOk ? "#15803d" : "#dc2626",
            fontWeight: 700, fontSize: 14,
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            animation: "slideIn 0.2s ease",
        }}>
            {msg}
        </div>
    );
}

//메인 컴포넌트
export default function AdminPage() {
    const [user, setUser] = useState(null);
    const [activeTab, setActiveTab] = useState("users");
    const [users, setUsers] = useState([]);
    const [lectures, setLectures] = useState([]);
    const [quizHistory, setQuizHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState("");
    const [searchUsers, setSearchUsers] = useState("");
    const [searchLectures, setSearchLectures] = useState("");
    const [searchQuiz, setSearchQuiz] = useState("");
    const [isDark] = useState(() => document.body.classList.contains("dark") ||
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    const token = localStorage.getItem("token");
    const authHeader = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    //인증 확인
    useEffect(() => {
        const raw = localStorage.getItem("user");
        if (!raw || !token) { window.location.href = "/"; return; }
        try {
            const u = JSON.parse(raw);
            if (!u.is_admin) { window.location.href = "/"; return; }
            setUser(u);
        } catch { window.location.href = "/"; }
    }, []);

    const showToast = useCallback((msg) => setToast(msg), []);

    //API 호출
    const api = useCallback(async (path, opts = {}) => {
        const res = await fetch(`${API_BASE_URL}${path}`, { headers: authHeader, ...opts });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, data };
    }, [token]);

    const loadUsers = useCallback(async () => {
        setLoading(true);
        const { ok, data } = await api("/api/admin/users");
        if (ok) setUsers(data); else showToast("❌ 유저 목록 불러오기 실패");
        setLoading(false);
    }, [api]);

    const loadLectures = useCallback(async () => {
        setLoading(true);
        const { ok, data } = await api("/api/admin/lectures");
        if (ok) setLectures(data); else showToast("❌ 강의 목록 불러오기 실패");
        setLoading(false);
    }, [api]);

    const loadQuizHistory = useCallback(async () => {
        setLoading(true);
        const { ok, data } = await api("/api/admin/quiz-history");
        if (ok) setQuizHistory(data); else showToast("❌ 퀴즈 히스토리 불러오기 실패");
        setLoading(false);
    }, [api]);

    useEffect(() => {
        if (!user) return;
        if (activeTab === "users") loadUsers();
        else if (activeTab === "lectures") loadLectures();
        else if (activeTab === "quiz") loadQuizHistory();
    }, [activeTab, user]);

    //액션
    async function deleteUser(userId, name) {
        if (!window.confirm(`"${name}" 유저를 삭제할까요?\n강의·퀴즈 히스토리·친구 관계가 모두 삭제됩니다.`)) return;
        const { ok, data } = await api(`/api/admin/users/${userId}`, { method: "DELETE" });
        showToast(ok ? `✅ ${data.message}` : `❌ ${data.message}`);
        if (ok) loadUsers();
    }

    async function deleteLecture(id, title) {
        if (!window.confirm(`"${title}" 강의를 삭제할까요?`)) return;
        const { ok, data } = await api(`/api/admin/lectures/${id}`, { method: "DELETE" });
        showToast(ok ? `✅ ${data.message}` : `❌ ${data.message}`);
        if (ok) loadLectures();
    }

    async function toggleAdmin(userId, isAdmin, name) {
        const action = isAdmin ? "해제" : "부여";
        if (!window.confirm(`"${name}"의 관리자 권한을 ${action}할까요?`)) return;
        const { ok, data } = await api(`/api/admin/users/${userId}/toggle-admin`, { method: "PATCH" });
        showToast(ok ? `✅ ${data.message}` : `❌ ${data.message}`);
        if (ok) loadUsers();
    }

    //색 필터
    const qu = searchUsers.toLowerCase();
    const ql = searchLectures.toLowerCase();
    const qq = searchQuiz.toLowerCase();

    const filteredUsers = users.filter(u =>
        u.name?.toLowerCase().includes(qu) ||
        u.email?.toLowerCase().includes(qu) ||
        (u.is_admin ? "관리자" : "일반").includes(qu)
    );
    const filteredLectures = lectures.filter(l =>
        l.title?.toLowerCase().includes(ql) ||
        l.user_name?.toLowerCase().includes(ql) ||
        l.user_email?.toLowerCase().includes(ql)
    );
    const filteredQuiz = quizHistory.filter(qh =>
        qh.user_name?.toLowerCase().includes(qq) ||
        qh.user_email?.toLowerCase().includes(qq) ||
        qh.lecture_title?.toLowerCase().includes(qq)
    );

    if (!user) return null;

    //스타일 변수
    const bg = isDark ? "#0f172a" : "#f4f7fb";
    const sidebar = isDark ? "rgba(30,41,59,0.95)" : "rgba(255,255,255,0.92)";
    const card = isDark ? "rgba(30,41,59,0.9)" : "rgba(255,255,255,0.9)";
    const text = isDark ? "#e2e8f0" : "#1e293b";
    const muted = isDark ? "#94a3b8" : "#64748b";
    const border = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
    const rowHover = isDark ? "rgba(255,255,255,0.04)" : "#f8faff";
    const thBg = isDark ? "rgba(255,255,255,0.06)" : "#f1f5f9";

    const tabs = [
        { key: "users", label: "유저 관리", count: users.length },
        { key: "lectures", label: "강의 관리", count: lectures.length },
        { key: "quiz", label: "퀴즈 히스토리", count: quizHistory.length },
    ];

    return (
        <div style={{ display: "flex", minHeight: "100vh", background: bg, fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif" }}>
            <style>{`
                @keyframes slideIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
                @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
                .adminRow:hover { background: ${rowHover} !important; }
                .adminTab:hover { background: ${isDark ? "rgba(255,255,255,0.08)" : "#eef4ff"} !important; color: #2563eb !important; }
                .adminActionBtn:hover { opacity: 0.8; }
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: ${isDark ? "#334155" : "#cbd5e1"}; border-radius: 99px; }
            `}</style>

            <Toast msg={toast} onClose={() => setToast("")} />

            {/*  사이드바  */}
            <aside style={{
                width: 220, minHeight: "100vh", position: "sticky", top: 0,
                background: sidebar, borderRight: `1px solid ${border}`,
                backdropFilter: "blur(20px)",
                display: "flex", flexDirection: "column", padding: "32px 16px", gap: 8,
                boxShadow: isDark ? "4px 0 24px rgba(0,0,0,0.3)" : "4px 0 24px rgba(0,0,0,0.06)",
            }}>
                {/* 로고 */}
                <div style={{ marginBottom: 28 }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: 16,
                        background: "linear-gradient(135deg, #ef4444, #dc2626)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 22, marginBottom: 12,
                        boxShadow: "0 8px 20px rgba(239,68,68,0.35)",
                    }}>🛡️</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: text }}>관리자 콘솔</div>
                    <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{user.name}</div>
                </div>

                {/* 탭 */}
                {tabs.map(t => (
                    <button key={t.key} className="adminTab" onClick={() => setActiveTab(t.key)} style={{
                        border: "none", textAlign: "left", padding: "12px 14px", borderRadius: 12,
                        cursor: "pointer", fontWeight: 600, fontSize: 14,
                        background: activeTab === t.key
                            ? "linear-gradient(135deg, #ef4444, #dc2626)"
                            : "transparent",
                        color: activeTab === t.key ? "#fff" : muted,
                        transition: "all 0.18s",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        boxShadow: activeTab === t.key ? "0 8px 20px rgba(239,68,68,0.28)" : "none",
                    }}>
                        <span>{t.label}</span>
                        {t.count > 0 && (
                            <span style={{
                                fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
                                background: activeTab === t.key ? "rgba(255,255,255,0.25)" : (isDark ? "rgba(255,255,255,0.1)" : "#e2e8f0"),
                                color: activeTab === t.key ? "#fff" : muted,
                            }}>{t.count}</span>
                        )}
                    </button>
                ))}

                <div style={{ flex: 1 }} />

                {/* 앱으로 돌아가기 */}
                <button onClick={() => window.location.href = "/"} style={{
                    border: "none", background: "transparent", padding: "11px 14px", borderRadius: 12,
                    cursor: "pointer", fontWeight: 600, fontSize: 13, color: muted, textAlign: "left",
                    display: "flex", alignItems: "center", gap: 8, transition: "color 0.15s",
                }}>
                    ← 앱으로 돌아가기
                </button>
            </aside>

            {/*  메인 콘텐츠  */}
            <main style={{ flex: 1, padding: "36px 40px", maxWidth: "calc(100vw - 220px)", overflow: "auto" }}>

                {/* 헤더 */}
                <div style={{ marginBottom: 28, animation: "fadeUp 0.3s ease" }}>
                    <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: text }}>
                        {tabs.find(t => t.key === activeTab)?.label}
                    </h1>
                    <p style={{ margin: "6px 0 0", color: muted, fontSize: 14 }}>
                        {activeTab === "users" && `전체 ${users.length}명의 유저를 관리합니다.`}
                        {activeTab === "lectures" && `전체 ${lectures.length}개의 강의를 관리합니다.`}
                        {activeTab === "quiz" && `최근 200건의 퀴즈 기록을 확인합니다.`}
                    </p>
                </div>

                {/* 검색 + 새로고침 */}
                <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                    <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
                        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: muted, fontSize: 16 }}>🔍</span>
                        {activeTab === "users" && (
                            <input
                                value={searchUsers}
                                onChange={e => setSearchUsers(e.target.value)}
                                placeholder="이름, 이메일, 역할로 검색..."
                                style={{
                                    width: "100%", padding: "10px 14px 10px 38px", border: `1.5px solid ${border}`,
                                    borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box",
                                    background: card, color: text,
                                }}
                            />
                        )}
                        {activeTab === "lectures" && (
                            <input
                                value={searchLectures}
                                onChange={e => setSearchLectures(e.target.value)}
                                placeholder="강의 제목, 작성자 이름, 이메일로 검색..."
                                style={{
                                    width: "100%", padding: "10px 14px 10px 38px", border: `1.5px solid ${border}`,
                                    borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box",
                                    background: card, color: text,
                                }}
                            />
                        )}
                        {activeTab === "quiz" && (
                            <input
                                value={searchQuiz}
                                onChange={e => setSearchQuiz(e.target.value)}
                                placeholder="유저 이름, 이메일, 강의 제목으로 검색..."
                                style={{
                                    width: "100%", padding: "10px 14px 10px 38px", border: `1.5px solid ${border}`,
                                    borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box",
                                    background: card, color: text,
                                }}
                            />
                        )}
                    </div>
                    <button onClick={() => {
                        if (activeTab === "users") loadUsers();
                        else if (activeTab === "lectures") loadLectures();
                        else loadQuizHistory();
                    }} style={{
                        padding: "10px 18px", borderRadius: 10, border: `1.5px solid ${border}`,
                        background: card, color: text, fontWeight: 600, fontSize: 13, cursor: "pointer",
                    }}>
                        새로고침
                    </button>
                </div>

                {/* 카드 */}
                <div style={{
                    background: card, borderRadius: 20, border: `1px solid ${border}`,
                    backdropFilter: "blur(20px)", overflow: "hidden",
                    boxShadow: isDark ? "0 20px 60px rgba(0,0,0,0.3)" : "0 20px 60px rgba(15,23,42,0.08)",
                    animation: "fadeUp 0.35s ease",
                }}>
                    {loading ? (
                        <div style={{ padding: 60, textAlign: "center", color: muted, fontSize: 14 }}>
                            <div style={{ fontSize: 32, marginBottom: 12, animation: "spin 1s linear infinite" }}>⟳</div>
                            불러오는 중...
                        </div>
                    ) : (
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>

                                {/* 유저 테이블 */}
                                {activeTab === "users" && (<>
                                    <thead>
                                        <tr style={{ background: thBg }}>
                                            {["이름", "이메일", "인증", "역할", "가입일", "관리"].map(h => (
                                                <th key={h} style={{ padding: "13px 16px", textAlign: "left", fontWeight: 700, fontSize: 12, color: muted, whiteSpace: "nowrap", borderBottom: `1px solid ${border}` }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredUsers.length === 0 ? (
                                            <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: muted }}>결과 없음</td></tr>
                                        ) : filteredUsers.map(u => (
                                            <tr key={u.user_id} className="adminRow" style={{ borderBottom: `1px solid ${border}`, transition: "background 0.15s" }}>
                                                <td style={{ padding: "12px 16px", fontWeight: 600, color: text }}>
                                                    {u.name}
                                                    {!!u.is_admin && (
                                                        <span style={{ marginLeft: 7, fontSize: 10, padding: "2px 7px", borderRadius: 99, background: "#fef3c7", color: "#92400e", fontWeight: 800 }}>ADMIN</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: "12px 16px", color: muted }}>{u.email}</td>
                                                <td style={{ padding: "12px 16px" }}>
                                                    <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 99, background: u.is_verified ? "#f0fdf4" : "#fef2f2", color: u.is_verified ? "#15803d" : "#dc2626" }}>
                                                        {u.is_verified ? "인증완료" : "미인증"}
                                                    </span>
                                                </td>
                                                <td style={{ padding: "12px 16px" }}>
                                                    <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 99, background: u.is_admin ? "#fef3c7" : (isDark ? "rgba(255,255,255,0.06)" : "#f1f5f9"), color: u.is_admin ? "#92400e" : muted }}>
                                                        {u.is_admin ? "관리자" : "일반"}
                                                    </span>
                                                </td>
                                                <td style={{ padding: "12px 16px", color: muted, whiteSpace: "nowrap" }}>{fmtDate(u.created_at)}</td>
                                                <td style={{ padding: "12px 16px" }}>
                                                    <div style={{ display: "flex", gap: 6 }}>
                                                        <button className="adminActionBtn"
                                                            disabled={String(u.user_id) === String(user.user_id)}
                                                            onClick={() => toggleAdmin(u.user_id, u.is_admin, u.name)}
                                                            style={{
                                                                padding: "5px 11px", borderRadius: 8, border: "none", cursor: "pointer",
                                                                fontSize: 12, fontWeight: 700, transition: "opacity 0.15s",
                                                                background: u.is_admin ? "#fef9c3" : "#f0fdf4",
                                                                color: u.is_admin ? "#92400e" : "#15803d",
                                                                opacity: String(u.user_id) === String(user.user_id) ? 0.4 : 1,
                                                            }}>
                                                            {u.is_admin ? "권한 해제" : "관리자 지정"}
                                                        </button>
                                                        <button className="adminActionBtn"
                                                            disabled={String(u.user_id) === String(user.user_id)}
                                                            onClick={() => deleteUser(u.user_id, u.name)}
                                                            style={{
                                                                padding: "5px 11px", borderRadius: 8, border: "none", cursor: "pointer",
                                                                fontSize: 12, fontWeight: 700, background: "#fef2f2", color: "#dc2626",
                                                                transition: "opacity 0.15s",
                                                                opacity: String(u.user_id) === String(user.user_id) ? 0.4 : 1,
                                                            }}>
                                                            삭제
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </>)}

                                {/*  강의 테이블  */}
                                {activeTab === "lectures" && (<>
                                    <thead>
                                        <tr style={{ background: thBg }}>
                                            {["강의 제목", "작성자", "이메일", "저장일", "관리"].map(h => (
                                                <th key={h} style={{ padding: "13px 16px", textAlign: "left", fontWeight: 700, fontSize: 12, color: muted, whiteSpace: "nowrap", borderBottom: `1px solid ${border}` }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredLectures.length === 0 ? (
                                            <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: muted }}>결과 없음</td></tr>
                                        ) : filteredLectures.map(l => (
                                            <tr key={l.id} className="adminRow" style={{ borderBottom: `1px solid ${border}`, transition: "background 0.15s" }}>
                                                <td style={{ padding: "12px 16px", fontWeight: 600, color: text, maxWidth: 280 }}>
                                                    <div title={l.title} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                        {l.title}
                                                    </div>
                                                </td>
                                                <td style={{ padding: "12px 16px", color: text }}>{l.user_name}</td>
                                                <td style={{ padding: "12px 16px", color: muted }}>{l.user_email}</td>
                                                <td style={{ padding: "12px 16px", color: muted, whiteSpace: "nowrap" }}>{fmtDate(l.created_at)}</td>
                                                <td style={{ padding: "12px 16px" }}>
                                                    <button className="adminActionBtn" onClick={() => deleteLecture(l.id, l.title)} style={{ padding: "5px 11px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: "#fef2f2", color: "#dc2626", transition: "opacity 0.15s" }}>
                                                        삭제
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </>)}

                                {/*  퀴즈 히스토리 테이블 */}
                                {activeTab === "quiz" && (<>
                                    <thead>
                                        <tr style={{ background: thBg }}>
                                            {["유저", "강의 제목", "점수", "정답/전체", "날짜"].map(h => (
                                                <th key={h} style={{ padding: "13px 16px", textAlign: "left", fontWeight: 700, fontSize: 12, color: muted, whiteSpace: "nowrap", borderBottom: `1px solid ${border}` }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredQuiz.length === 0 ? (
                                            <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: muted }}>결과 없음</td></tr>
                                        ) : filteredQuiz.map(q => (
                                            <tr key={q.id} className="adminRow" style={{ borderBottom: `1px solid ${border}`, transition: "background 0.15s" }}>
                                                <td style={{ padding: "12px 16px" }}>
                                                    <div style={{ fontWeight: 600, color: text }}>{q.user_name}</div>
                                                    <div style={{ fontSize: 12, color: muted }}>{q.user_email}</div>
                                                </td>
                                                <td style={{ padding: "12px 16px", color: text, maxWidth: 240 }}>
                                                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.lecture_title || "–"}</div>
                                                </td>
                                                <td style={{ padding: "12px 16px" }}>
                                                    <span style={{
                                                        fontWeight: 800, fontSize: 15, padding: "3px 10px", borderRadius: 99,
                                                        background: q.score >= 80 ? "#f0fdf4" : q.score >= 50 ? "#fffbeb" : "#fef2f2",
                                                        color: q.score >= 80 ? "#15803d" : q.score >= 50 ? "#92400e" : "#dc2626",
                                                    }}>
                                                        {q.score}점
                                                    </span>
                                                </td>
                                                <td style={{ padding: "12px 16px", color: text, fontWeight: 600 }}>{q.correct}/{q.total}</td>
                                                <td style={{ padding: "12px 16px", color: muted, whiteSpace: "nowrap" }}>{fmtDate(q.created_at)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </>)}

                            </table>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
