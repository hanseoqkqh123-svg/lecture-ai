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
    const [activeTab, setActiveTab] = useState("dashboard");
    const [users, setUsers] = useState([]);
    const [lectures, setLectures] = useState([]);
    const [quizHistory, setQuizHistory] = useState([]);
    const [stats, setStats] = useState(null);
    const [statsLoading, setStatsLoading] = useState(false);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState("");
    const [confirmModal, setConfirmModal] = useState({
        open: false,
        action: null,
        payload: null,
        title: "",
        description: "",
        targetLabel: "",
        confirmText: "확인",
        danger: false,
        loading: false,
    });
    const [userDetailModal, setUserDetailModal] = useState({ open: false, data: null, loading: false });
    const [userDetailTab, setUserDetailTab] = useState("lectures"); // "lectures" | "quiz"
    const [searchUsers, setSearchUsers] = useState("");
    const [searchLectures, setSearchLectures] = useState("");
    const [searchQuiz, setSearchQuiz] = useState("");
    const [isDark, setIsDark] = useState(
        () => localStorage.getItem("darkMode") === "true"
    );
    useEffect(() => {
        // App.js가 localStorage에 "darkMode" 키를 쓰면 storage 이벤트로 감지
        const handleStorage = (e) => {
            if (e.key === "darkMode") {
                setIsDark(e.newValue === "true");
            }
        };
        window.addEventListener("storage", handleStorage);
        return () => window.removeEventListener("storage", handleStorage);
    }, []);

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

    const loadStats = useCallback(async () => {
        setStatsLoading(true);
        const { ok, data } = await api("/api/admin/stats");
        if (ok) setStats(data); else showToast("❌ 통계 불러오기 실패");
        setStatsLoading(false);
    }, [api]);

    const openUserDetail = useCallback(async (userId) => {
        setUserDetailTab("lectures");
        setUserDetailModal({ open: true, data: null, loading: true });
        const { ok, data } = await api(`/api/admin/users/${userId}/detail`);
        if (ok) {
            setUserDetailModal({ open: true, data, loading: false });
        } else {
            showToast("❌ 유저 상세 정보 불러오기 실패");
            setUserDetailModal({ open: false, data: null, loading: false });
        }
    }, [api]);

    useEffect(() => {
        if (!user) return;
        if (activeTab === "dashboard") loadStats();
        else if (activeTab === "users") loadUsers();
        else if (activeTab === "lectures") loadLectures();
        else if (activeTab === "quiz") loadQuizHistory();
    }, [activeTab, user]);

    //액션
    function closeConfirmModal() {
        setConfirmModal({
            open: false,
            action: null,
            payload: null,
            title: "",
            description: "",
            targetLabel: "",
            confirmText: "확인",
            danger: false,
            loading: false,
        });
    }

    function deleteUser(userId, name) {
        setConfirmModal({
            open: true,
            action: "deleteUser",
            payload: { userId, name },
            title: "유저 삭제",
            description: "이 유저를 삭제하면 강의, 퀴즈 히스토리, 친구 관계가 모두 삭제됩니다.",
            targetLabel: name,
            confirmText: "삭제하기",
            danger: true,
            loading: false,
        });
    }

    function deleteLecture(id, title) {
        setConfirmModal({
            open: true,
            action: "deleteLecture",
            payload: { id, title },
            title: "강의 삭제",
            description: "이 강의를 삭제하시겠습니까? 삭제한 강의는 복구할 수 없습니다.",
            targetLabel: title,
            confirmText: "삭제하기",
            danger: true,
            loading: false,
        });
    }

    function toggleAdmin(userId, isAdmin, name) {
        const actionText = isAdmin ? "해제" : "지정";

        setConfirmModal({
            open: true,
            action: "toggleAdmin",
            payload: { userId, isAdmin, name },
            title: `관리자 권한 ${actionText}`,
            description: `"${name}"님의 관리자 권한을 ${actionText}하시겠습니까?`,
            targetLabel: name,
            confirmText: isAdmin ? "권한 해제" : "관리자 지정",
            danger: false,
            loading: false,
        });
    }

    async function submitConfirmAction() {
        if (!confirmModal.action || !confirmModal.payload) return;

        setConfirmModal((prev) => ({
            ...prev,
            loading: true,
        }));

        try {
            if (confirmModal.action === "deleteUser") {
                const { userId } = confirmModal.payload;
                const { ok, data } = await api(`/api/admin/users/${userId}`, {
                    method: "DELETE",
                });

                showToast(ok ? `✅ ${data.message}` : `❌ ${data.message}`);
                if (ok) {
                    await loadUsers();
                    closeConfirmModal();
                    return;
                }
            }

            if (confirmModal.action === "deleteLecture") {
                const { id } = confirmModal.payload;
                const { ok, data } = await api(`/api/admin/lectures/${id}`, {
                    method: "DELETE",
                });

                showToast(ok ? `✅ ${data.message}` : `❌ ${data.message}`);
                if (ok) {
                    await loadLectures();
                    closeConfirmModal();
                    return;
                }
            }

            if (confirmModal.action === "toggleAdmin") {
                const { userId } = confirmModal.payload;
                const { ok, data } = await api(`/api/admin/users/${userId}/toggle-admin`, {
                    method: "PATCH",
                });

                showToast(ok ? `✅ ${data.message}` : `❌ ${data.message}`);
                if (ok) {
                    await loadUsers();
                    closeConfirmModal();
                    return;
                }
            }

            setConfirmModal((prev) => ({
                ...prev,
                loading: false,
            }));
        } catch (err) {
            showToast("❌ 처리 중 오류가 발생했습니다.");
            setConfirmModal((prev) => ({
                ...prev,
                loading: false,
            }));
        }
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
        { key: "dashboard", label: "대시보드", count: 0 },
        { key: "users", label: "유저 관리", count: users.length },
        { key: "lectures", label: "강의 관리", count: lectures.length },
        { key: "quiz", label: "퀴즈 히스토리", count: quizHistory.length },
    ];

    return (
        <div style={{ display: "flex", minHeight: "100vh", background: bg, fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif" }}>
            <style>{`
                @keyframes slideIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
                @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes barGrow { from { width: 0; } to { width: 100%; } }
                .adminRow:hover { background: ${rowHover} !important; }
                .adminTab:hover { background: ${isDark ? "rgba(255,255,255,0.08)" : "#eef4ff"} !important; color: #2563eb !important; }
                .adminActionBtn:hover { opacity: 0.8; }
                .statCard:hover { transform: translateY(-2px); box-shadow: ${isDark ? "0 24px 60px rgba(0,0,0,0.4)" : "0 24px 60px rgba(15,23,42,0.12)"} !important; }
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: ${isDark ? "#334155" : "#cbd5e1"}; border-radius: 99px; }
            `}</style>

            <Toast msg={toast} onClose={() => setToast("")} />

            {/* ── 유저 상세 모달 ───────────────────────────────────── */}
            {userDetailModal.open && (
                <div
                    onClick={() => setUserDetailModal({ open: false, data: null, loading: false })}
                    style={{
                        position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)",
                        zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center",
                        padding: 20, backdropFilter: "blur(6px)",
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: "100%", maxWidth: 620, maxHeight: "85vh",
                            background: card, borderRadius: 24, border: `1px solid ${border}`,
                            boxShadow: isDark ? "0 32px 80px rgba(0,0,0,0.5)" : "0 32px 80px rgba(15,23,42,0.25)",
                            animation: "fadeUp 0.2s ease", overflow: "hidden",
                            display: "flex", flexDirection: "column",
                        }}
                    >
                        {userDetailModal.loading ? (
                            <div style={{ padding: 60, textAlign: "center", color: muted }}>
                                <div style={{ fontSize: 32, marginBottom: 12, display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</div>
                                <div style={{ fontSize: 14 }}>불러오는 중...</div>
                            </div>
                        ) : userDetailModal.data ? (() => {
                            const { user: u, lectures: uLectures, quizHistory: uQuiz } = userDetailModal.data;
                            const avgQ = uQuiz.length ? Math.round(uQuiz.reduce((a, b) => a + b.score, 0) / uQuiz.length) : null;
                            return (
                                <>
                                    {/* 모달 헤더 */}
                                    <div style={{ padding: "24px 28px 0", flexShrink: 0 }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                                <div style={{
                                                    width: 52, height: 52, borderRadius: 16,
                                                    background: "linear-gradient(135deg, #2563eb, #4f46e5)",
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    fontSize: 22, color: "#fff", fontWeight: 800, flexShrink: 0,
                                                    boxShadow: "0 8px 20px rgba(37,99,235,0.3)",
                                                }}>
                                                    {u.name?.charAt(0) ?? "?"}
                                                </div>
                                                <div>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                        <span style={{ fontSize: 20, fontWeight: 800, color: text }}>{u.name}</span>
                                                        {!!u.is_admin && (
                                                            <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 99, background: "#fef3c7", color: "#92400e", fontWeight: 800 }}>ADMIN</span>
                                                        )}
                                                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, fontWeight: 700, background: u.is_verified ? "#f0fdf4" : "#fef2f2", color: u.is_verified ? "#15803d" : "#dc2626" }}>
                                                            {u.is_verified ? "인증완료" : "미인증"}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: 13, color: muted, marginTop: 3 }}>{u.email}</div>
                                                    <div style={{ fontSize: 12, color: muted, marginTop: 1 }}>가입일 {fmtDate(u.created_at)}</div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setUserDetailModal({ open: false, data: null, loading: false })}
                                                style={{ border: "none", background: isDark ? "rgba(255,255,255,0.08)" : "#f1f5f9", color: text, width: 36, height: 36, borderRadius: 999, cursor: "pointer", fontSize: 18, flexShrink: 0 }}
                                            >×</button>
                                        </div>
                                        {/* 요약 스탯 */}
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
                                            {[
                                                { label: "강의 수", value: uLectures.length, color: "#2563eb" },
                                                { label: "퀴즈 횟수", value: uQuiz.length, color: "#7c3aed" },
                                                { label: "평균 점수", value: avgQ !== null ? `${avgQ}점` : "–", color: avgQ >= 80 ? "#15803d" : avgQ >= 50 ? "#92400e" : "#dc2626" },
                                            ].map(s => (
                                                <div key={s.label} style={{ background: isDark ? "rgba(255,255,255,0.05)" : "#f8fafc", borderRadius: 14, padding: "14px 16px", border: `1px solid ${border}` }}>
                                                    <div style={{ fontSize: 11, color: muted, fontWeight: 700, marginBottom: 4 }}>{s.label}</div>
                                                    <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                                                </div>
                                            ))}
                                        </div>
                                        {/* 탭 구분선 */}
                                        <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${border}` }}>
                                            {[
                                                { key: "lectures", label: `강의 목록 (${uLectures.length})` },
                                                { key: "quiz", label: `퀴즈 기록 (${uQuiz.length})` },
                                            ].map(tab => (
                                                <div
                                                    key={tab.key}
                                                    onClick={() => setUserDetailTab(tab.key)}
                                                    style={{
                                                        fontSize: 13, fontWeight: 700, padding: "8px 18px", cursor: "pointer",
                                                        color: userDetailTab === tab.key ? "#2563eb" : muted,
                                                        borderBottom: userDetailTab === tab.key ? "2px solid #2563eb" : "2px solid transparent",
                                                        transition: "all 0.15s",
                                                    }}
                                                >{tab.label}</div>
                                            ))}
                                        </div>
                                    </div>
                                    {/* 스크롤 바디 */}
                                    <div style={{ overflowY: "auto", padding: "16px 28px 24px" }}>
                                        {/* 강의 목록 탭 */}
                                        {userDetailTab === "lectures" && (
                                            <div>
                                                {uLectures.length === 0 ? (
                                                    <div style={{ textAlign: "center", color: muted, fontSize: 13, padding: "32px 0" }}>강의 없음</div>
                                                ) : uLectures.map((l, idx) => (
                                                    <div key={l.id} style={{
                                                        display: "flex", justifyContent: "space-between", alignItems: "center",
                                                        padding: "10px 14px", borderRadius: 10,
                                                        background: isDark ? "rgba(255,255,255,0.04)" : "#f8fafc",
                                                        marginBottom: 6, border: `1px solid ${border}`,
                                                        animation: `fadeUp 0.2s ease ${idx * 0.03}s both`,
                                                    }}>
                                                        <div style={{ fontSize: 13, fontWeight: 600, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>{l.title}</div>
                                                        <div style={{ fontSize: 12, color: muted, flexShrink: 0 }}>{fmtDate(l.created_at)}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {/* 퀴즈 기록 탭 */}
                                        {userDetailTab === "quiz" && (
                                            <div>
                                                {uQuiz.length === 0 ? (
                                                    <div style={{ textAlign: "center", color: muted, fontSize: 13, padding: "32px 0" }}>퀴즈 기록 없음</div>
                                                ) : uQuiz.map((q, idx) => (
                                                    <div key={q.id} style={{
                                                        display: "flex", justifyContent: "space-between", alignItems: "center",
                                                        padding: "10px 14px", borderRadius: 10,
                                                        background: isDark ? "rgba(255,255,255,0.04)" : "#f8fafc",
                                                        marginBottom: 6, border: `1px solid ${border}`,
                                                        animation: `fadeUp 0.2s ease ${idx * 0.03}s both`,
                                                    }}>
                                                        <div style={{ fontSize: 13, fontWeight: 600, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>{q.lecture_title || "–"}</div>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                            <span style={{ fontSize: 12, color: muted }}>{q.correct}/{q.total}</span>
                                                            <span style={{
                                                                fontSize: 12, fontWeight: 800, padding: "2px 9px", borderRadius: 99,
                                                                background: q.score >= 80 ? "#f0fdf4" : q.score >= 50 ? "#fffbeb" : "#fef2f2",
                                                                color: q.score >= 80 ? "#15803d" : q.score >= 50 ? "#92400e" : "#dc2626",
                                                            }}>{q.score}점</span>
                                                            <span style={{ fontSize: 11, color: muted }}>{fmtDate(q.created_at)}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </>
                            );
                        })() : null}
                    </div>
                </div>
            )}

            {confirmModal.open && (
                <div
                    onClick={confirmModal.loading ? undefined : closeConfirmModal}
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(15, 23, 42, 0.45)",
                        zIndex: 10000,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 20,
                        backdropFilter: "blur(4px)",
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: "100%",
                            maxWidth: 440,
                            background: card,
                            color: text,
                            borderRadius: 24,
                            padding: 24,
                            border: `1px solid ${border}`,
                            boxShadow: isDark
                                ? "0 24px 80px rgba(0,0,0,0.45)"
                                : "0 24px 80px rgba(15, 23, 42, 0.25)",
                            animation: "fadeUp 0.18s ease-out",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: 18,
                                gap: 12,
                            }}
                        >
                            <div>
                                <h2
                                    style={{
                                        margin: 0,
                                        fontSize: 22,
                                        fontWeight: 900,
                                        color: text,
                                    }}
                                >
                                    {confirmModal.title}
                                </h2>

                                <p
                                    style={{
                                        margin: "6px 0 0",
                                        color: muted,
                                        fontSize: 14,
                                        lineHeight: 1.5,
                                    }}
                                >
                                    {confirmModal.description}
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={closeConfirmModal}
                                disabled={confirmModal.loading}
                                style={{
                                    border: "none",
                                    background: isDark ? "rgba(255,255,255,0.08)" : "#f1f5f9",
                                    color: text,
                                    width: 36,
                                    height: 36,
                                    borderRadius: 999,
                                    cursor: confirmModal.loading ? "not-allowed" : "pointer",
                                    fontSize: 18,
                                    flexShrink: 0,
                                }}
                            >
                                ×
                            </button>
                        </div>

                        <div
                            style={{
                                padding: 16,
                                borderRadius: 16,
                                background: isDark ? "rgba(255,255,255,0.05)" : "#f8fafc",
                                border: `1px solid ${border}`,
                                marginBottom: 18,
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 13,
                                    color: muted,
                                    marginBottom: 6,
                                    fontWeight: 700,
                                }}
                            >
                                대상
                            </div>

                            <div
                                style={{
                                    fontWeight: 900,
                                    color: text,
                                    wordBreak: "break-all",
                                }}
                            >
                                {confirmModal.targetLabel || "선택된 항목"}
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
                                onClick={closeConfirmModal}
                                disabled={confirmModal.loading}
                                style={{
                                    flex: 1,
                                    border: `1px solid ${border}`,
                                    borderRadius: 14,
                                    padding: "12px 16px",
                                    cursor: confirmModal.loading ? "not-allowed" : "pointer",
                                    fontWeight: 800,
                                    background: isDark ? "rgba(255,255,255,0.06)" : "#fff",
                                    color: text,
                                }}
                            >
                                취소
                            </button>

                            <button
                                type="button"
                                onClick={submitConfirmAction}
                                disabled={confirmModal.loading}
                                style={{
                                    flex: 1,
                                    border: "none",
                                    borderRadius: 14,
                                    padding: "12px 16px",
                                    cursor: confirmModal.loading ? "not-allowed" : "pointer",
                                    fontWeight: 900,
                                    background: confirmModal.danger
                                        ? "#ef4444"
                                        : "linear-gradient(135deg, #2563eb, #4f46e5)",
                                    color: "#fff",
                                    boxShadow: confirmModal.danger
                                        ? "0 10px 24px rgba(239,68,68,0.25)"
                                        : "0 10px 24px rgba(37,99,235,0.25)",
                                    opacity: confirmModal.loading ? 0.65 : 1,
                                }}
                            >
                                {confirmModal.loading ? "처리 중..." : confirmModal.confirmText}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                        {activeTab === "dashboard" && "서비스 현황을 한눈에 확인합니다."}
                        {activeTab === "users" && `전체 ${users.length}명의 유저를 관리합니다.`}
                        {activeTab === "lectures" && `전체 ${lectures.length}개의 강의를 관리합니다.`}
                        {activeTab === "quiz" && `최근 200건의 퀴즈 기록을 확인합니다.`}
                    </p>
                </div>

                {/* ── 대시보드 ──────────────────────────────────────── */}
                {activeTab === "dashboard" && (
                    <div style={{ animation: "fadeUp 0.35s ease" }}>
                        {statsLoading || !stats ? (
                            <div style={{ padding: 60, textAlign: "center", color: muted }}>
                                <div style={{ fontSize: 32, marginBottom: 12, display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</div>
                                <div style={{ fontSize: 14 }}>통계 불러오는 중...</div>
                            </div>
                        ) : (<>
                            {/* 요약 카드 4개 */}
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
                                {[
                                    { label: "전체 유저", value: stats.userCount, sub: `이번 주 +${stats.newUsersWeek}명`, icon: "👥", color: "#2563eb", bg: "#eff6ff" },
                                    { label: "인증 완료", value: stats.verifiedCount, sub: `미인증 ${stats.userCount - stats.verifiedCount}명`, icon: "✅", color: "#15803d", bg: "#f0fdf4" },
                                    { label: "전체 강의", value: stats.lectureCount, sub: `이번 주 +${stats.newLecturesWeek}개`, icon: "📚", color: "#7c3aed", bg: "#f5f3ff" },
                                    { label: "퀴즈 응시", value: `${stats.quizCount}회`, sub: `전체 응시 기록`, icon: "🎯", color: "#c2410c", bg: "#fff7ed" },
                                ].map((s, i) => (
                                    <div key={s.label} className="statCard" style={{
                                        background: card, borderRadius: 20, border: `1px solid ${border}`,
                                        padding: "22px 24px", backdropFilter: "blur(20px)",
                                        boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.2)" : "0 8px 32px rgba(15,23,42,0.06)",
                                        transition: "transform 0.18s, box-shadow 0.18s",
                                        animation: `fadeUp 0.35s ease ${i * 0.06}s both`,
                                    }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                                            <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
                                            <div style={{ width: 36, height: 36, borderRadius: 10, background: isDark ? "rgba(255,255,255,0.08)" : s.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{s.icon}</div>
                                        </div>
                                        <div style={{ fontSize: 32, fontWeight: 900, color: s.color, lineHeight: 1, marginBottom: 6 }}>{s.value}</div>
                                        <div style={{ fontSize: 12, color: muted }}>{s.sub}</div>
                                    </div>
                                ))}
                            </div>

                            {/* 하단: 일별 가입 추이 + TOP 퀴즈 응시자 */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

                                {/* 최근 14일 가입 추이 */}
                                <div style={{ background: card, borderRadius: 20, border: `1px solid ${border}`, padding: "22px 24px", boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.2)" : "0 8px 32px rgba(15,23,42,0.06)" }}>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: text, marginBottom: 4 }}>신규 가입 추이</div>
                                    <div style={{ fontSize: 12, color: muted, marginBottom: 18 }}>최근 14일</div>
                                    {stats.dailyUsers.length === 0 ? (
                                        <div style={{ textAlign: "center", color: muted, fontSize: 13, padding: "20px 0" }}>데이터 없음</div>
                                    ) : (() => {
                                        const maxVal = Math.max(...stats.dailyUsers.map(d => d.cnt), 1);
                                        return (
                                            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100 }}>
                                                {stats.dailyUsers.map((d, i) => {
                                                    const h = Math.max((d.cnt / maxVal) * 90, 4);
                                                    const dayLabel = new Date(d.day).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
                                                    return (
                                                        <div key={d.day} title={`${dayLabel}: ${d.cnt}명`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, animation: `fadeUp 0.3s ease ${i * 0.02}s both` }}>
                                                            <div style={{ width: "100%", height: h, borderRadius: "4px 4px 0 0", background: "linear-gradient(180deg, #2563eb, #4f46e5)", opacity: 0.85 }} />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* TOP 5 퀴즈 응시자 */}
                                <div style={{ background: card, borderRadius: 20, border: `1px solid ${border}`, padding: "22px 24px", boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.2)" : "0 8px 32px rgba(15,23,42,0.06)" }}>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: text, marginBottom: 4 }}>퀴즈 TOP 5</div>
                                    <div style={{ fontSize: 12, color: muted, marginBottom: 18 }}>응시 횟수 × 총 문제 수 기준</div>
                                    {stats.topQuizzers.length === 0 ? (
                                        <div style={{ textAlign: "center", color: muted, fontSize: 13, padding: "20px 0" }}>데이터 없음</div>
                                    ) : (() => {
                                        // 복합 점수: 응시횟수 × 총 문제 수(total_questions). 없으면 quiz_cnt만 사용
                                        const withScore = stats.topQuizzers.map(q => ({
                                            ...q,
                                            composite: q.quiz_cnt * (q.total_questions || q.quiz_cnt),
                                        })).sort((a, b) => b.composite - a.composite);
                                        const maxComposite = withScore[0].composite || 1;
                                        const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
                                        return withScore.map((q, i) => {
                                            const pct = Math.round((q.composite / maxComposite) * 100);
                                            return (
                                                <div key={q.email} style={{ marginBottom: 12, animation: `fadeUp 0.3s ease ${i * 0.05}s both` }}>
                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                                            <span style={{ fontSize: 14 }}>{medals[i]}</span>
                                                            <span style={{ fontSize: 13, fontWeight: 700, color: text }}>{q.name}</span>
                                                        </div>
                                                        <div style={{ fontSize: 12, color: muted }}>
                                                            {q.quiz_cnt}회 · {q.total_questions ?? q.quiz_cnt}문제 · 평균 {q.avg_score}점
                                                        </div>
                                                    </div>
                                                    <div style={{ height: 6, borderRadius: 99, background: isDark ? "rgba(255,255,255,0.08)" : "#e2e8f0" }}>
                                                        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: "linear-gradient(90deg, #2563eb, #7c3aed)", transition: "width 0.6s ease" }} />
                                                    </div>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            </div>
                        </>)}
                    </div>
                )}

                {/* 검색 + 새로고침 + 카드 */}
                {activeTab !== "dashboard" && (<>
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
                                                                onClick={() => openUserDetail(u.user_id)}
                                                                style={{
                                                                    padding: "5px 11px", borderRadius: 8, border: "none", cursor: "pointer",
                                                                    fontSize: 12, fontWeight: 700, background: isDark ? "rgba(255,255,255,0.08)" : "#f1f5f9",
                                                                    color: text, transition: "opacity 0.15s",
                                                                }}>
                                                                상세보기
                                                            </button>
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
                </>)}
            </main>
        </div>
    );
}
