import React, { useEffect, useState } from "react";

const STORAGE_KEY = "lecture-ai-team-board";

export default function BoardPage({ onBack }) {
    const [notes, setNotes] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        } catch {
            return [];
        }
    });

    const [draggingId, setDraggingId] = useState(null);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    }, [notes]);

    const addNote = () => {
        const newNote = {
            id: Date.now(),
            text: "새 메모",
            x: 120,
            y: 120,
        };

        setNotes((prev) => [...prev, newNote]);
    };

    const updateNote = (id, patch) => {
        setNotes((prev) =>
            prev.map((note) =>
                note.id === id ? { ...note, ...patch } : note
            )
        );
    };

    const deleteNote = (id) => {
        setNotes((prev) => prev.filter((note) => note.id !== id));
    };

    const handleMouseMove = (e) => {
        if (!draggingId) return;

        updateNote(draggingId, {
            x: e.clientX - 90,
            y: e.clientY - 70,
        });
    };

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 50,
                background: "#f4f7fb",
                padding: 24,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
            }}
            onMouseMove={handleMouseMove}
            onMouseUp={() => setDraggingId(null)}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 14,
                }}
            >
                <div>
                    <h2 style={{ margin: 0 }}>공동 보드</h2>
                    <p className="subText" style={{ marginTop: 6 }}>
                        팀원들과 강의 요약, 발표 흐름, 아이디어를 자유롭게 정리하세요.
                    </p>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                    <button className="primaryBtn" onClick={addNote}>
                        + 메모 추가
                    </button>

                    <button className="secondaryBtn" onClick={onBack}>
                        ← 팀 프로젝트로 돌아가기
                    </button>
                </div>
            </div>

            <div
                style={{
                    flex: 1,
                    position: "relative",
                    borderRadius: 22,
                    background: "#ffffff",
                    border: "1px solid #e5e7eb",
                    overflow: "hidden",
                    boxShadow: "0 12px 36px rgba(44, 62, 106, 0.08)",
                }}
            >
                {notes.map((note) => (
                    <div
                        key={note.id}
                        style={{
                            position: "absolute",
                            left: note.x,
                            top: note.y,
                            width: 190,
                            minHeight: 130,
                            background: "#fde68a",
                            borderRadius: 14,
                            padding: 12,
                            boxShadow: "0 10px 22px rgba(0,0,0,0.12)",
                            cursor: draggingId === note.id ? "grabbing" : "grab",
                        }}
                        onMouseDown={() => setDraggingId(note.id)}
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                deleteNote(note.id);
                            }}
                            style={{
                                position: "absolute",
                                top: 8,
                                right: 8,
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                                fontSize: 14,
                            }}
                        >
                            ✕
                        </button>

                        <textarea
                            value={note.text}
                            onMouseDown={(e) => e.stopPropagation()}
                            onChange={(e) =>
                                updateNote(note.id, { text: e.target.value })
                            }
                            style={{
                                width: "100%",
                                height: 95,
                                marginTop: 18,
                                border: "none",
                                outline: "none",
                                resize: "none",
                                background: "transparent",
                                fontSize: 15,
                                fontWeight: 600,
                                color: "#1f2937",
                            }}
                        />
                    </div>
                ))}

                {notes.length === 0 && (
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#94a3b8",
                            fontWeight: 600,
                        }}
                    >
                        + 메모 추가를 눌러 아이디어를 정리해보세요.
                    </div>
                )}
            </div>
        </div>
    );
}