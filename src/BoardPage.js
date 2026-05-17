import React, { useEffect, useRef, useState, useCallback } from "react";

const STORAGE_KEY = "lecture-ai-team-board-v3";

const COLORS = ["#111827", "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#f59e0b"];
const NOTE_COLORS = ["#fde68a", "#bfdbfe", "#bbf7d0", "#fecaca", "#ddd6fe", "#fed7aa"];

export default function BoardPage({ onBack, socket, API_BASE_URL, getAuthHeaders, isDarkMode }) {
    const boardRef = useRef(null);
    const imageInputRef = useRef(null);
    const editingNoteIdRef = useRef(null);
    const editingTextRef = useRef({});

    const [tool, setTool] = useState("select"); // select | pen | eraser | rect | circle | arrow | text
    const [notes, setNotes] = useState([]);
    const [drawings, setDrawings] = useState([]);
    const [history, setHistory] = useState([]);
    const [future, setFuture] = useState([]);
    const [clipboardItem, setClipboardItem] = useState(null);

    const [selectedId, setSelectedId] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);
    const [dragging, setDragging] = useState(null);
    const [resizing, setResizing] = useState(null);
    const [panning, setPanning] = useState(null);
    const [currentStroke, setCurrentStroke] = useState(null);
    const [currentShape, setCurrentShape] = useState(null);
    const [selectionBox, setSelectionBox] = useState(null);
    const [isSpacePressed, setIsSpacePressed] = useState(false);

    const [strokeColor, setStrokeColor] = useState("#111827");
    const [strokeWidth, setStrokeWidth] = useState(4);

    const [view, setView] = useState({
        x: 0,
        y: 0,
        zoom: 1,
    });

    useEffect(() => {
        const preventBrowserZoom = (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
            }
        };

        window.addEventListener("wheel", preventBrowserZoom, { passive: false });

        return () => {
            window.removeEventListener("wheel", preventBrowserZoom);
        };
    }, []);

    const saveBoardItem = useCallback(async (item, itemType) => {
    try {
        await fetch(`${API_BASE_URL}/api/board/items`, {
            method: "POST",
            headers: getAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
                id: item.id,
                item_type: itemType,
                data: item,
            }),
        });
    } catch (err) {
        console.error("보드 저장 실패:", err);
    }
}, [API_BASE_URL, getAuthHeaders]);

const deleteBoardItem = useCallback(async (id) => {
    try {
        await fetch(`${API_BASE_URL}/api/board/items/${id}`, {
            method: "DELETE",
            headers: getAuthHeaders(),
        });
    } catch (err) {
        console.error("보드 삭제 실패:", err);
    }
}, [API_BASE_URL, getAuthHeaders]);

useEffect(() => {
    const fetchBoardItems = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/board/items`, {
                headers: getAuthHeaders(),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || "보드 불러오기 실패");
            }

            setNotes(
                data
                    .filter((item) => item.item_type === "note")
                    .map((item) => item.data)
            );

            setDrawings(
                data
                    .filter((item) => item.item_type === "drawing")
                    .map((item) => item.data)
            );
        } catch (err) {
            console.error("보드 불러오기 실패:", err);
        }
    };

    fetchBoardItems();
}, [API_BASE_URL, getAuthHeaders]);

useEffect(() => {
    if (!socket) return;

        const handleSaved = (item) => {
        let myUserId = null;

        try {
            const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
            myUserId = storedUser?.user_id;
        } catch {
            myUserId = null;
        }

        const isMine = String(item.owner_id) === String(myUserId);

        if (item.item_type === "note") {
    setNotes((prev) => {
        const exists = prev.some((note) => note.id === item.id);

        if (editingNoteIdRef.current === item.id) {
            return prev;
        }

        if (!exists) {
            return [...prev, item.data];
        }

        return prev.map((note) => {
            if (note.id !== item.id) return note;

            const localUpdatedAt = note.updatedAt || 0;
            const incomingUpdatedAt = item.data?.updatedAt || 0;

            if (localUpdatedAt > incomingUpdatedAt) {
                return note;
            }

            return item.data;
        });
    });
}

        if (item.item_type === "drawing") {
            setDrawings((prev) => {
                const exists = prev.some((drawing) => drawing.id === item.id);

                if (isMine && exists) {
                    return prev;
                }

                return exists
                    ? prev.map((drawing) => drawing.id === item.id ? item.data : drawing)
                    : [...prev, item.data];
            });
        }
    };

    const handleDeleted = ({ id }) => {
        setNotes((prev) => prev.filter((note) => note.id !== id));
        setDrawings((prev) => prev.filter((drawing) => drawing.id !== id));
    };

    socket.on("board_item_saved", handleSaved);
    socket.on("board_item_deleted", handleDeleted);
    socket.on("board_cleared", () => {
    setNotes([]);
    setDrawings([]);
    setSelectedId(null);
    setSelectedIds([]);
});

    return () => {
        socket.off("board_item_saved", handleSaved);
        socket.off("board_item_deleted", handleDeleted);
        socket.off("board_cleared");
    };
}, [socket]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            const isTyping =
                e.target.tagName === "TEXTAREA" ||
                e.target.tagName === "INPUT";

            if (isTyping) return;

            if (e.code === "Space") {
                e.preventDefault();
                setIsSpacePressed(true);
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
                e.preventDefault();
                copySelected();
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
                e.preventDefault();
                pasteClipboard();
            }

            if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                deleteSelected();
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
                e.preventDefault();
                undo();
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
                e.preventDefault();
                redo();
            }
        };

        const handleKeyUp = (e) => {
            if (e.code === "Space") {
                setIsSpacePressed(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, [selectedId, notes, drawings, clipboardItem]);

    const screenToBoard = (clientX, clientY) => {
        const rect = boardRef.current.getBoundingClientRect();

        return {
            x: (clientX - rect.left - view.x) / view.zoom,
            y: (clientY - rect.top - view.y) / view.zoom,
        };
    };

    const addNote = () => {
    saveHistory();

    const newNote = {
        id: `note_${Date.now()}`,
        type: "note",
        text: "",
        x: 180,
        y: 140,
        width: 220,
        height: 150,
        color: "#fde68a",
        updatedAt: Date.now(),
    };

    setNotes((prev) => [...prev, newNote]);

    saveBoardItem(newNote, "note");

    setSelectedId(newNote.id);
    setSelectedIds([newNote.id]);
    setTool("select");
};

    const addTextBox = (x, y) => {
    saveHistory();

    const newText = {
        id: `text_${Date.now()}`,
        type: "text",
        text: "",
        x,
        y,
        width: 220,
        height: 60,
        color: "#111827",
        updatedAt: Date.now(),
    };

    setNotes((prev) => [...prev, newText]);

    saveBoardItem(newText, "note");

    setSelectedId(newText.id);
    setSelectedIds([newText.id]);
    setTool("select");
};

    const addImageToBoard = (file) => {
        if (!file) return;

        saveHistory();

        const reader = new FileReader();

        reader.onload = () => {
            const newImage = {
                id: `image_${Date.now()}`,
                type: "image",
                src: reader.result,
                x: 220,
                y: 180,
                width: 280,
                height: 180,
            };

            setNotes((prev) => [...prev, newImage]);
            saveBoardItem(newImage, "note");
            setSelectedId(newImage.id);
            setTool("select");
        };

        reader.readAsDataURL(file);
    };

    const updateNote = (id, patch) => {
    let updatedNote = null;

    setNotes((prev) =>
        prev.map((note) => {
            if (note.id !== id) return note;

            updatedNote = {
                ...note,
                ...patch,
                text: editingTextRef.current[id] ?? note.text,
                updatedAt: Date.now(),
            };

            return updatedNote;
        })
    );

    setTimeout(() => {
        if (updatedNote) {
            saveBoardItem(updatedNote, "note");
        }
    }, 0);
};

        const saveNoteById = (id, patch = {}) => {
        const target = notes.find((note) => note.id === id);
        if (target) {
            saveBoardItem({ ...target, ...patch }, "note");
        }
    };

    const saveHistory = () => {
        setHistory((prev) => [
            ...prev,
            {
                notes: JSON.parse(JSON.stringify(notes)),
                drawings: JSON.parse(JSON.stringify(drawings)),
            },
        ]);

        setFuture([]);
    };

    const undo = () => {
        if (history.length === 0) return;

        const previous = history[history.length - 1];

        setFuture((prev) => [
            ...prev,
            {
                notes: JSON.parse(JSON.stringify(notes)),
                drawings: JSON.parse(JSON.stringify(drawings)),
            },
        ]);

        setNotes(previous.notes);
        setDrawings(previous.drawings);
        setHistory((prev) => prev.slice(0, -1));
        setSelectedId(null);
        setSelectedIds([]);
    };

    const redo = () => {
        if (future.length === 0) return;

        const next = future[future.length - 1];

        setHistory((prev) => [
            ...prev,
            {
                notes: JSON.parse(JSON.stringify(notes)),
                drawings: JSON.parse(JSON.stringify(drawings)),
            },
        ]);

        setNotes(next.notes);
        setDrawings(next.drawings);
        setFuture((prev) => prev.slice(0, -1));
        setSelectedId(null);
        setSelectedIds([]);
    };

    const selectItem = (id, isMulti = false) => {
        if (isMulti) {
            setSelectedIds((prev) =>
                prev.includes(id)
                    ? prev.filter((itemId) => itemId !== id)
                    : [...prev, id]
            );
            setSelectedId(id);
            return;
        }

        setSelectedId(id);
        setSelectedIds([id]);
    };

    const deleteSelected = () => {
        if (selectedIds.length === 0) return;

        saveHistory();

        setNotes((prev) => prev.filter((note) => !selectedIds.includes(note.id)));
        setDrawings((prev) => prev.filter((drawing) => !selectedIds.includes(drawing.id)));

        selectedIds.forEach((id) => {
            deleteBoardItem(id);
        });

        setSelectedId(null);
        setSelectedIds([]);
    };

    const copySelected = () => {
        if (!selectedId) return;

        const selectedNote = notes.find((note) => note.id === selectedId);
        const selectedDrawing = drawings.find((drawing) => drawing.id === selectedId);

        if (selectedNote) {
            setClipboardItem({
                kind: "note",
                data: JSON.parse(JSON.stringify(selectedNote)),
            });
            return;
        }

        if (selectedDrawing) {
            setClipboardItem({
                kind: "drawing",
                data: JSON.parse(JSON.stringify(selectedDrawing)),
            });
        }
    };

    const pasteClipboard = () => {
        if (!clipboardItem) return;

        saveHistory();

        const copied = JSON.parse(JSON.stringify(clipboardItem.data));
        const newId = `${copied.type}_${Date.now()}`;

        if (clipboardItem.kind === "note") {
            const newNote = {
                ...copied,
                id: newId,
                x: copied.x + 30,
                y: copied.y + 30,
            };

            setNotes((prev) => [...prev, newNote]);
            saveBoardItem(newNote, "note");
            setSelectedId(newNote.id);
            return;
        }

        if (clipboardItem.kind === "drawing") {
            let newDrawing = {
                ...copied,
                id: newId,
            };

            if (newDrawing.type === "stroke") {
                newDrawing.points = newDrawing.points.map((point) => ({
                    x: point.x + 30,
                    y: point.y + 30,
                }));
            } else {
                newDrawing.x = newDrawing.x + 30;
                newDrawing.y = newDrawing.y + 30;
            }

            setDrawings((prev) => [...prev, newDrawing]);
            saveBoardItem(newDrawing, "drawing");
            setSelectedId(newDrawing.id);
        }
    };

    const handleMouseDownNote = (e, note) => {
        e.stopPropagation();

        if (tool === "eraser") {
            saveHistory();

            setNotes((prev) => prev.filter((item) => item.id !== note.id));
            deleteBoardItem(note.id);
            setSelectedId(null);
            setSelectedIds([]);
            return;
        }
        if (tool !== "select") return;

        saveHistory();

        selectItem(note.id, e.shiftKey);

        const moveIds = e.shiftKey ? [...selectedIds, note.id] : selectedIds.includes(note.id) ? selectedIds : [note.id];

        setDragging({
            type: "multi",
            ids: [...new Set(moveIds)],
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            startNotes: JSON.parse(JSON.stringify(notes)),
            startDrawings: JSON.parse(JSON.stringify(drawings)),
        });
    };

    const handleMouseDownDrawing = (e, drawing) => {
        e.stopPropagation();

        if (tool === "eraser") {
            saveHistory();

            setDrawings((prev) =>
                prev.filter((item) => item.id !== drawing.id)
            );
            deleteBoardItem(drawing.id);
            setSelectedId(null);
            setSelectedIds([]);
            return;
        }

        if (tool !== "select") return;

        saveHistory();

        selectItem(drawing.id, e.shiftKey);

        const moveIds = e.shiftKey ? [...selectedIds, drawing.id] : selectedIds.includes(drawing.id) ? selectedIds : [drawing.id];

        setDragging({
            type: "multi",
            ids: [...new Set(moveIds)],
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            startNotes: JSON.parse(JSON.stringify(notes)),
            startDrawings: JSON.parse(JSON.stringify(drawings)),
        });
    };

    const handleBoardMouseDown = (e) => {

        if (!boardRef.current) return;

        if (isSpacePressed) {
            setPanning({
                startMouseX: e.clientX,
                startMouseY: e.clientY,
                startX: view.x,
                startY: view.y,
            });
            return;
        }

        if (tool === "text") {
            const point = screenToBoard(e.clientX, e.clientY);
            addTextBox(point.x, point.y);
            return;
        }

        if (tool === "pen") {
            const point = screenToBoard(e.clientX, e.clientY);

            const stroke = {
                id: `stroke_${Date.now()}`,
                type: "stroke",
                color: strokeColor,
                width: strokeWidth,
                points: [point],
            };

            setCurrentStroke(stroke);
            setSelectedId(null);
            setSelectedIds([]);

            return;
        }

        if (tool === "rect" || tool === "circle" || tool === "arrow") {
            const point = screenToBoard(e.clientX, e.clientY);

            setCurrentShape({
                id: `shape_${Date.now()}`,
                type: tool,
                x: point.x,
                y: point.y,
                width: 0,
                height: 0,
                color: strokeColor,
                strokeWidth,
            });

            setSelectedId(null);
            setSelectedIds([]);
            return;
        }

        if (tool === "select") {
            if (e.target !== boardRef.current) return;

            const point = screenToBoard(e.clientX, e.clientY);

            setSelectedId(null);
            setSelectedIds([]);

            setSelectionBox({
                startX: point.x,
                startY: point.y,
                x: point.x,
                y: point.y,
                width: 0,
                height: 0,
            });
        }
    };

    const handleMouseMove = (e) => {
        if (currentStroke && tool === "pen") {
            const point = screenToBoard(e.clientX, e.clientY);

            setCurrentStroke((prev) => {
                if (!prev) return prev;

                return {
                    ...prev,
                    points: [...prev.points, point],
                };
            });

            return;
        }

        if (currentShape && (tool === "rect" || tool === "circle" || tool === "arrow")) {
            const point = screenToBoard(e.clientX, e.clientY);

            setCurrentShape((prev) => {
                if (!prev) return prev;

                return {
                    ...prev,
                    width: point.x - prev.x,
                    height: point.y - prev.y,
                };
            });

            return;
        }

        if (selectionBox) {
            const point = screenToBoard(e.clientX, e.clientY);

            setSelectionBox((prev) => {
                if (!prev) return prev;

                return {
                    ...prev,
                    x: Math.min(prev.startX, point.x),
                    y: Math.min(prev.startY, point.y),
                    width: Math.abs(point.x - prev.startX),
                    height: Math.abs(point.y - prev.startY),
                };
            });

            return;
        }

        if (dragging) {
            const dx = (e.clientX - dragging.startMouseX) / view.zoom;
            const dy = (e.clientY - dragging.startMouseY) / view.zoom;

            if (dragging.type === "multi") {
                setNotes((prev) =>
                    prev.map((note) => {
                        if (!dragging.ids.includes(note.id)) return note;

                        const original = dragging.startNotes.find((item) => item.id === note.id);
                        if (!original) return note;

                        return {
                            ...note,
                            x: original.x + dx,
                            y: original.y + dy,
                        };
                    })
                );

                setDrawings((prev) =>
                    prev.map((drawing) => {
                        if (!dragging.ids.includes(drawing.id)) return drawing;

                        const original = dragging.startDrawings.find((item) => item.id === drawing.id);
                        if (!original) return drawing;

                        if (drawing.type === "stroke") {
                            return {
                                ...drawing,
                                points: original.points.map((point) => ({
                                    x: point.x + dx,
                                    y: point.y + dy,
                                })),
                            };
                        }

                        return {
                            ...drawing,
                            x: original.x + dx,
                            y: original.y + dy,
                        };
                    })
                );

                return;
            }

            return;
        }

        if (resizing) {
            const dx = (e.clientX - resizing.startMouseX) / view.zoom;
            const dy = (e.clientY - resizing.startMouseY) / view.zoom;

            setNotes((prev) =>
                prev.map((note) => {
                    if (note.id !== resizing.id) return note;

                    return {
                        ...note,
                        width: Math.max(80, resizing.startWidth + dx),
                        height: Math.max(50, resizing.startHeight + dy),
                    };
                })
            );

            return;
        }

        if (panning) {
            setView((prev) => ({
                ...prev,
                x: panning.startX + (e.clientX - panning.startMouseX),
                y: panning.startY + (e.clientY - panning.startMouseY),
            }));
        }
    };

    const handleMouseUp = () => {
        if (currentStroke) {
            if (currentStroke.points.length > 1) {
                saveHistory();
                setDrawings((prev) => [...prev, currentStroke]);
                saveBoardItem(currentStroke, "drawing");
            }

            setCurrentStroke(null);
        }

        if (currentShape) {
            if (Math.abs(currentShape.width) > 5 && Math.abs(currentShape.height) > 5) {
                saveHistory();
                setDrawings((prev) => [...prev, currentShape]);
                saveBoardItem(currentShape, "drawing");
            }

            setCurrentShape(null);
        }

                if (dragging?.type === "multi") {
            notes
                .filter((note) => dragging.ids.includes(note.id))
                .forEach((note) => {
                    saveBoardItem(note, "note");
                });

            drawings
                .filter((drawing) => dragging.ids.includes(drawing.id))
                .forEach((drawing) => {
                    saveBoardItem(drawing, "drawing");
                });
        }

        if (resizing) {
            const resizedNote = notes.find((note) => note.id === resizing.id);
            if (resizedNote) {
                saveBoardItem(resizedNote, "note");
            }
        }

        setDragging(null);
        setPanning(null);

        if (selectionBox) {
            const selectedNoteIds = notes
                .filter((note) => isInsideBox(note, selectionBox))
                .map((note) => note.id);

            const selectedDrawingIds = drawings
                .filter((drawing) => isInsideBox(drawing, selectionBox))
                .map((drawing) => drawing.id);

            const allSelected = [...selectedNoteIds, ...selectedDrawingIds];

            setSelectedIds(allSelected);
            setSelectedId(allSelected[0] || null);
            setSelectionBox(null);
        }

        setResizing(null);
    };

    const handleWheel = (e) => {
        if (!e.ctrlKey) return;

        e.preventDefault();

        const rect = boardRef.current.getBoundingClientRect();

        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;

        setView((prev) => {
            const newZoom = Math.min(3, Math.max(0.2, prev.zoom * zoomFactor));

            const worldX = (mouseX - prev.x) / prev.zoom;
            const worldY = (mouseY - prev.y) / prev.zoom;

            return {
                zoom: newZoom,
                x: mouseX - worldX * newZoom,
                y: mouseY - worldY * newZoom,
            };
        });
    };

    const pointsToPath = (points) => {
        if (!points || points.length === 0) return "";

        const [first, ...rest] = points;

        return [
            `M ${first.x} ${first.y}`,
            ...rest.map((point) => `L ${point.x} ${point.y}`),
        ].join(" ");
    };

    const isInsideBox = (item, box) => {
        if (!box) return false;

        if (item.type === "stroke") {
            return item.points.some(
                (point) =>
                    point.x >= box.x &&
                    point.x <= box.x + box.width &&
                    point.y >= box.y &&
                    point.y <= box.y + box.height
            );
        }

        const itemX = item.x;
        const itemY = item.y;
        const itemW = Math.abs(item.width || 0);
        const itemH = Math.abs(item.height || 0);

        return (
            itemX >= box.x &&
            itemX + itemW <= box.x + box.width &&
            itemY >= box.y &&
            itemY + itemH <= box.y + box.height
        );
    };

    const changeSelectedNoteColor = (color) => {
        if (!selectedId) return;

        updateNote(selectedId, { color });
    };

    const zoomIn = () => {
        setView((prev) => ({
            ...prev,
            zoom: Math.min(prev.zoom + 0.1, 2),
        }));
    };

    const zoomOut = () => {
        setView((prev) => ({
            ...prev,
            zoom: Math.max(prev.zoom - 0.1, 0.4),
        }));
    };

    const resetView = () => {
        setView({ x: 0, y: 0, zoom: 1 });
    };

    const clearBoard = async () => {
    if (!window.confirm("보드 내용을 전부 삭제할까요?")) return;

    saveHistory();

    setNotes([]);
    setDrawings([]);
    setSelectedId(null);
    setSelectedIds([]);
    setCurrentStroke(null);
    setCurrentShape(null);
    setDragging(null);
    setResizing(null);

    try {
        await fetch(`${API_BASE_URL}/api/board/items`, {
            method: "DELETE",
            headers: getAuthHeaders(),
        });
    } catch (err) {
        console.error("보드 전체 삭제 실패:", err);
    }
};

        const boardTheme = {
        pageBg: isDarkMode ? "#020617" : "#eef3ff",
        headerBg: isDarkMode ? "rgba(15,23,42,0.96)" : "rgba(255,255,255,0.96)",
        headerBorder: isDarkMode ? "#334155" : "#e5e7eb",
        title: isDarkMode ? "#f9fafb" : "#111827",
        subText: isDarkMode ? "#94a3b8" : "#64748b",
        boardBg: isDarkMode ? "#0f172a" : "#eef3ff",
        dotColor: isDarkMode ? "#334155" : "#cbd5e1",
        panelBg: isDarkMode ? "#1e293b" : "#ffffff",
        panelBorder: isDarkMode ? "#334155" : "#e5e7eb",
        panelText: isDarkMode ? "#e5e7eb" : "#475569",
        selectBg: isDarkMode ? "#0f172a" : "#ffffff",
        selectText: isDarkMode ? "#f9fafb" : "#111827",
    };

    const toolbarBtnStyle = {
        minWidth: 54,
        height: 34,
        padding: "7px 9px",
        borderRadius: 10,
        fontSize: 12,
        whiteSpace: "nowrap",
    };

    const getVisibleStrokeColor = (color) => {
        return isDarkMode && color === "#111827" ? "#f9fafb" : color;
    };

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 50,
                background: boardTheme.pageBg,
                overflow: "hidden",
                fontFamily: "Pretendard, Noto Sans KR, Arial, sans-serif",
            }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
        >
                        <div
                style={{
                    height: 156,
                    padding: "14px 20px 12px",
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gridTemplateRows: "auto auto",
                    gap: 10,
                    background: boardTheme.headerBg,
                    borderBottom: `1px solid ${boardTheme.headerBorder}`,
                    boxShadow: isDarkMode
                        ? "0 4px 18px rgba(0,0,0,0.35)"
                        : "0 4px 18px rgba(0,0,0,0.05)",
                    position: "relative",
                    zIndex: 10,
                }}
            >
                <div>
                    <h2 style={{ margin: 0, fontSize: 22, color: boardTheme.title }}>
                        공동 보드
                    </h2>
                    <div style={{ fontSize: 13, color: boardTheme.subText, marginTop: 4 }}>
                        메모와 펜으로 발표 흐름을 자유롭게 정리하세요.
                    </div>
                </div>

                <button
                    className="secondaryBtn"
                    onClick={() => {
                        if (onBack) onBack();
                        else window.location.href = "/";
                    }}
                    style={{ whiteSpace: "nowrap", height: 40 }}
                >
                    ← 돌아가기
                </button>

                <div
                    style={{
                        gridColumn: "1 / -1",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                        alignItems: "center",
                        overflow: "visible",
                    }}
                >
                    <button className={tool === "select" ? "primaryBtn" : "secondaryBtn"} style={toolbarBtnStyle} onClick={() => setTool("select")}>선택</button>
                    <button className={tool === "pen" ? "primaryBtn" : "secondaryBtn"} style={toolbarBtnStyle} onClick={() => setTool("pen")}>펜</button>
                    <button className={tool === "eraser" ? "primaryBtn" : "secondaryBtn"} style={toolbarBtnStyle} onClick={() => setTool("eraser")}>지우개</button>
                    <button className={tool === "rect" ? "primaryBtn" : "secondaryBtn"} style={toolbarBtnStyle} onClick={() => setTool("rect")}>사각형</button>
                    <button className={tool === "circle" ? "primaryBtn" : "secondaryBtn"} style={toolbarBtnStyle} onClick={() => setTool("circle")}>원</button>
                    <button className={tool === "arrow" ? "primaryBtn" : "secondaryBtn"} style={toolbarBtnStyle} onClick={() => setTool("arrow")}>화살표</button>
                    <button className={tool === "text" ? "primaryBtn" : "secondaryBtn"} style={toolbarBtnStyle} onClick={() => setTool("text")}>텍스트</button>

                    <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            addImageToBoard(file);
                            e.target.value = "";
                        }}
                    />

                    <button className="secondaryBtn" style={toolbarBtnStyle} onClick={() => imageInputRef.current?.click()}>이미지</button>
                    <button className="secondaryBtn" style={toolbarBtnStyle} onClick={undo} disabled={history.length === 0}>되돌리기</button>
                    <button className="secondaryBtn" style={toolbarBtnStyle} onClick={copySelected} disabled={!selectedId}>복사</button>
                    <button className="secondaryBtn" style={toolbarBtnStyle} onClick={pasteClipboard} disabled={!clipboardItem}>붙여넣기</button>
                    <button className="secondaryBtn" style={toolbarBtnStyle} onClick={redo} disabled={future.length === 0}>다시 실행</button>
                    <button className="primaryBtn" style={toolbarBtnStyle} onClick={addNote}>+ 메모</button>
                    <button className="secondaryBtn" style={{ ...toolbarBtnStyle, minWidth: 38 }} onClick={zoomOut}>-</button>

                    <span style={{ fontSize: 13, fontWeight: 800, color: boardTheme.panelText, padding: "0 4px" }}>
                        {Math.round(view.zoom * 100)}%
                    </span>

                    <button className="secondaryBtn" style={{ ...toolbarBtnStyle, minWidth: 38 }} onClick={zoomIn}>+</button>
                    <button className="secondaryBtn" style={{ ...toolbarBtnStyle, minWidth: 78 }} onClick={resetView}>화면 초기화</button>
                    <button className="secondaryBtn" style={{ ...toolbarBtnStyle, minWidth: 72 }} onClick={deleteSelected} disabled={!selectedId}>선택 삭제</button>
                    <button className="secondaryBtn" style={{ ...toolbarBtnStyle, minWidth: 68 }} onClick={clearBoard}>전체 삭제</button>
                </div>
            </div>

                        <div
                style={{
                    position: "absolute",
                    top: 170,
                    left: 20,
                    zIndex: 10,
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    background: boardTheme.panelBg,
                    border: `1px solid ${boardTheme.panelBorder}`,
                    borderRadius: 999,
                    padding: "8px 12px",
                    boxShadow: isDarkMode
                        ? "0 8px 24px rgba(0,0,0,0.35)"
                        : "0 8px 24px rgba(0,0,0,0.08)",
                }}
            >
                <span style={{ fontSize: 13, fontWeight: 700, color: boardTheme.panelText }}>
                    펜 색상
                </span>

                {COLORS.map((color) => (
                    <button
                        key={color}
                        onClick={() => setStrokeColor(color)}
                        style={{
                            width: 26,
                            height: 26,
                            borderRadius: "50%",
                            border:
                                strokeColor === color
                                    ? "3px solid #60a5fa"
                                    : `2px solid ${isDarkMode ? "#0f172a" : "#ffffff"}`,
                            background: color,
                            cursor: "pointer",
                            boxShadow: `0 0 0 1px ${isDarkMode ? "#475569" : "#cbd5e1"}`,
                        }}
                    />
                ))}

                <select
                    value={strokeWidth}
                    onChange={(e) => setStrokeWidth(Number(e.target.value))}
                    style={{
                        background: boardTheme.selectBg,
                        color: boardTheme.selectText,
                        border: `1px solid ${boardTheme.panelBorder}`,
                        borderRadius: 999,
                        padding: "6px 10px",
                        fontWeight: 700,
                    }}
                >
                    <option value={2}>얇게</option>
                    <option value={4}>보통</option>
                    <option value={7}>굵게</option>
                    <option value={11}>매우 굵게</option>
                </select>
            </div>

                        <div
                style={{
                    position: "absolute",
                    top: 224,
                    left: 20,
                    zIndex: 10,
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    background: boardTheme.panelBg,
                    border: `1px solid ${boardTheme.panelBorder}`,
                    borderRadius: 999,
                    padding: 8,
                    boxShadow: isDarkMode
                        ? "0 8px 24px rgba(0,0,0,0.35)"
                        : "0 8px 24px rgba(0,0,0,0.08)",
                }}
            >
                <span style={{ fontSize: 13, fontWeight: 700, color: boardTheme.panelText }}>
                    메모 색상
                </span>

                {NOTE_COLORS.map((color) => (
                    <button
                        key={color}
                        onClick={() => changeSelectedNoteColor(color)}
                        disabled={!selectedId}
                        style={{
                            width: 26,
                            height: 26,
                            borderRadius: "50%",
                            border: `2px solid ${isDarkMode ? "#0f172a" : "#ffffff"}`,
                            background: color,
                            cursor: selectedId ? "pointer" : "not-allowed",
                            boxShadow: `0 0 0 1px ${isDarkMode ? "#475569" : "#cbd5e1"}`,
                            opacity: selectedId ? 1 : 0.5,
                        }}
                    />
                ))}
            </div>

            <div
                ref={boardRef}
                onMouseDown={handleBoardMouseDown}
                onWheel={handleWheel}
                style={{
                    position: "absolute",
                    inset: "156px 0 0 0",
                    overflow: "hidden",
                    cursor:
                        isSpacePressed
                            ? panning
                                ? "grabbing"
                                : "grab"
                            : tool === "pen"
                                ? "crosshair"
                                : tool === "eraser"
                                    ? "not-allowed"
                                    : panning
                                        ? "grabbing"
                                        : "grab",
                                        backgroundColor: boardTheme.boardBg,
                    backgroundImage:
                        `radial-gradient(circle, ${boardTheme.dotColor} 1px, transparent 1px)`,
                    backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`,
                    backgroundPosition: `${view.x}px ${view.y}px`,
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
                        transformOrigin: "0 0",
                        width: 5000,
                        height: 5000,
                    }}
                >
                    <svg

                        width="5000"
                        height="5000"
                        style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            overflow: "visible",
                            pointerEvents: tool === "select" || tool === "eraser" ? "auto" : "none",
                        }}
                    >
                        <defs>
                            <marker
                                id="arrowhead"
                                markerWidth="10"
                                markerHeight="10"
                                refX="8"
                                refY="3"
                                orient="auto"
                                markerUnits="strokeWidth"
                            >
                                            <path d="M0,0 L0,6 L9,3 z" fill={getVisibleStrokeColor(strokeColor)} />
                            </marker>
                        </defs>

                        {drawings.map((drawing) => {
                            if (drawing.type === "rect") {
                                return (
                                    <rect
                                        key={drawing.id}
                                        x={Math.min(drawing.x, drawing.x + drawing.width)}
                                        y={Math.min(drawing.y, drawing.y + drawing.height)}
                                        width={Math.abs(drawing.width)}
                                        height={Math.abs(drawing.height)}
                                        fill="transparent"
                                        stroke={getVisibleStrokeColor(drawing.color)}
                                        strokeWidth={drawing.strokeWidth}
                                        onMouseDown={(e) => handleMouseDownDrawing(e, drawing)}
                                        style={{
                                            cursor: tool === "select" ? "pointer" : "default",
                                            filter: selectedIds.includes(drawing.id)
                                                ? "drop-shadow(0 0 4px #2563eb)"
                                                : "none",
                                        }}
                                    />
                                );
                            }

                            if (drawing.type === "circle") {
                                return (
                                    <ellipse
                                        key={drawing.id}
                                        cx={drawing.x + drawing.width / 2}
                                        cy={drawing.y + drawing.height / 2}
                                        rx={Math.abs(drawing.width / 2)}
                                        ry={Math.abs(drawing.height / 2)}
                                        fill="transparent"
                                        stroke={getVisibleStrokeColor(drawing.color)}
                                        strokeWidth={drawing.strokeWidth}
                                        onMouseDown={(e) => handleMouseDownDrawing(e, drawing)}
                                        style={{
                                            cursor: tool === "select" ? "pointer" : "default",
                                            filter: selectedIds.includes(drawing.id)
                                                ? "drop-shadow(0 0 4px #2563eb)"
                                                : "none",
                                        }}
                                    />
                                );
                            }

                            if (drawing.type === "arrow") {
                                return (
                                    <line
                                        key={drawing.id}
                                        x1={drawing.x}
                                        y1={drawing.y}
                                        x2={drawing.x + drawing.width}
                                        y2={drawing.y + drawing.height}
                                        stroke={getVisibleStrokeColor(drawing.color)}
                                        strokeWidth={drawing.strokeWidth}
                                        strokeLinecap="round"
                                        markerEnd="url(#arrowhead)"
                                        onMouseDown={(e) => handleMouseDownDrawing(e, drawing)}
                                        style={{
                                            cursor: tool === "select" ? "pointer" : "default",
                                            filter:
                                                selectedIds.includes(drawing.id)
                                                    ? "drop-shadow(0 0 4px #2563eb)"
                                                    : "none",
                                        }}
                                    />
                                );
                            }

                            return (
                                <path
                                    key={drawing.id}
                                    d={pointsToPath(drawing.points)}
                                    fill="none"
                                    stroke={getVisibleStrokeColor(drawing.color)}
                                    strokeWidth={drawing.width}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    onMouseDown={(e) => handleMouseDownDrawing(e, drawing)}
                                    style={{
                                        cursor: tool === "select" ? "pointer" : "default",
                                        filter:
                                            selectedIds.includes(drawing.id)
                                                ? "drop-shadow(0 0 4px #2563eb)"
                                                : "none",
                                    }}
                                />
                            );
                        })}

                        {currentStroke && (
                            <path
                                d={pointsToPath(currentStroke.points)}
                                fill="none"
                                stroke={getVisibleStrokeColor(currentStroke.color)}
                                strokeWidth={currentStroke.width}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        )}

                        {currentShape && currentShape.type === "rect" && (
                            <rect
                                x={Math.min(currentShape.x, currentShape.x + currentShape.width)}
                                y={Math.min(currentShape.y, currentShape.y + currentShape.height)}
                                width={Math.abs(currentShape.width)}
                                height={Math.abs(currentShape.height)}
                                fill="transparent"
                                stroke={getVisibleStrokeColor(currentShape.color)}
                                strokeWidth={currentShape.strokeWidth}
                            />
                        )}

                        {currentShape && currentShape.type === "arrow" && (
                            <line
                                x1={currentShape.x}
                                y1={currentShape.y}
                                x2={currentShape.x + currentShape.width}
                                y2={currentShape.y + currentShape.height}
                                stroke={getVisibleStrokeColor(currentShape.color)}
                                strokeWidth={currentShape.strokeWidth}
                                strokeLinecap="round"
                                markerEnd="url(#arrowhead)"
                            />
                        )}

                        {currentShape && currentShape.type === "circle" && (
                            <ellipse
                                cx={currentShape.x + currentShape.width / 2}
                                cy={currentShape.y + currentShape.height / 2}
                                rx={Math.abs(currentShape.width / 2)}
                                ry={Math.abs(currentShape.height / 2)}
                                fill="transparent"
                                stroke={getVisibleStrokeColor(currentShape.color)}
                                strokeWidth={currentShape.strokeWidth}
                            />
                        )}
                    </svg>

                    {selectionBox && (
                        <div
                            style={{
                                position: "absolute",
                                left: selectionBox.x,
                                top: selectionBox.y,
                                width: selectionBox.width,
                                height: selectionBox.height,
                                border: "1px solid #2563eb",
                                background: "rgba(37, 99, 235, 0.12)",
                                pointerEvents: "none",
                                zIndex: 3,
                            }}
                        />
                    )}

                    {notes.map((note) => {

                        if (note.type === "text") {
                            const selected = selectedIds.includes(note.id);

                            return (
                                <div
                                    key={note.id}
                                    onMouseDown={(e) => handleMouseDownNote(e, note)}
                                    style={{
                                        position: "absolute",
                                        left: note.x,
                                        top: note.y,
                                        width: note.width,
                                        height: note.height,
                                        border: selected ? "2px solid #2563eb" : "1px dashed transparent",
                                        background: "transparent",
                                        cursor:
                                            tool === "select"
                                                ? dragging?.id === note.id
                                                    ? "grabbing"
                                                    : "grab"
                                                : "default",
                                    }}
                                >
                                    <textarea
                                        defaultValue={note.text}
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            selectItem(note.id, e.shiftKey);
                                        }}
                                        onFocus={() => {
                                            editingNoteIdRef.current = note.id;
                                        }}
                                        onChange={(e) => {
                                            editingTextRef.current[note.id] = e.target.value;
                                        }}
                                        onBlur={(e) => {
                                            const latestText = editingTextRef.current[note.id] ?? e.target.value;

                                            const updatedNote = {
                                                ...note,
                                                text: latestText,
                                                updatedAt: Date.now(),
                                            };

                                            setNotes((prev) =>
                                                prev.map((item) =>
                                                    item.id === note.id ? updatedNote : item
                                                )
                                            );

                                            saveBoardItem(updatedNote, "note");

                                            setTimeout(() => {
                                                if (editingNoteIdRef.current === note.id) {
                                                    editingNoteIdRef.current = null;
                                                }
                                                delete editingTextRef.current[note.id];
                                            }, 300);
                                        }}

                                        style={{
                                            width: "100%",
                                            height: "100%",
                                            background: "transparent",
                                            border: "none",
                                            outline: "none",
                                            resize: "none",
                                            color: getVisibleStrokeColor(note.color),
                                            fontSize: 24,
                                            fontWeight: 700,
                                            lineHeight: 1.4,
                                            padding: 6,
                                        }}
                                    />

                                    {selected && tool === "select" && (
                                        <div
                                            onMouseDown={(e) => {
                                                e.stopPropagation();

                                                saveHistory();

                                                setResizing({
                                                    id: note.id,
                                                    startMouseX: e.clientX,
                                                    startMouseY: e.clientY,
                                                    startWidth: note.width,
                                                    startHeight: note.height,
                                                });
                                            }}
                                            style={{
                                                position: "absolute",
                                                right: -8,
                                                bottom: -8,
                                                width: 16,
                                                height: 16,
                                                borderRadius: "50%",
                                                background: "#2563eb",
                                                cursor: "nwse-resize",
                                            }}
                                        />
                                    )}
                                </div>
                            );
                        }

                        if (note.type === "image") {
                            const selected = selectedIds.includes(note.id);

                            return (
                                <div
                                    key={note.id}
                                    onMouseDown={(e) => handleMouseDownNote(e, note)}
                                    style={{
                                        position: "absolute",
                                        left: note.x,
                                        top: note.y,
                                        width: note.width,
                                        height: note.height,
                                        border: selected ? "3px solid #2563eb" : "1px solid transparent",
                                        borderRadius: 12,
                                        overflow: "hidden",
                                        cursor:
                                            tool === "select"
                                                ? dragging?.id === note.id
                                                    ? "grabbing"
                                                    : "grab"
                                                : "default",
                                        boxShadow: selected
                                            ? "0 12px 30px rgba(37,99,235,0.25)"
                                            : "0 8px 22px rgba(0,0,0,0.12)",
                                        background: "#fff",
                                    }}
                                >
                                    <img
                                        src={note.src}
                                        alt="board"
                                        draggable={false}
                                        style={{
                                            width: "100%",
                                            height: "100%",
                                            objectFit: "cover",
                                            display: "block",
                                            pointerEvents: "none",
                                        }}
                                    />

                                    {selected && tool === "select" && (
                                        <div
                                            onMouseDown={(e) => {
                                                e.stopPropagation();

                                                saveHistory();

                                                setResizing({
                                                    id: note.id,
                                                    startMouseX: e.clientX,
                                                    startMouseY: e.clientY,
                                                    startWidth: note.width,
                                                    startHeight: note.height,
                                                });
                                            }}
                                            style={{
                                                position: "absolute",
                                                right: -8,
                                                bottom: -8,
                                                width: 16,
                                                height: 16,
                                                borderRadius: "50%",
                                                background: "#2563eb",
                                                cursor: "nwse-resize",
                                                zIndex: 5,
                                            }}
                                        />
                                    )}
                                </div>



                            );
                        }

                        const selected = selectedIds.includes(note.id);

                        return (
                            <div
                                key={note.id}
                                onMouseDown={(e) => handleMouseDownNote(e, note)}
                                style={{
                                    position: "absolute",
                                    left: note.x,
                                    top: note.y,
                                    width: note.width,
                                    minHeight: note.height,
                                    background: note.color,
                                    borderRadius: 18,
                                    padding: 14,
                                    boxShadow: selected
                                        ? "0 0 0 3px #2563eb, 0 16px 32px rgba(0,0,0,0.16)"
                                        : "0 12px 24px rgba(0,0,0,0.12)",
                                    cursor:
                                        tool === "select"
                                            ? dragging?.id === note.id
                                                ? "grabbing"
                                                : "grab"
                                            : "default",
                                }}
                            >
                                <textarea
                                    defaultValue={note.text}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onFocus={() => {
                                        editingNoteIdRef.current = note.id;
                                    }}
                                    onChange={(e) => {
                                        editingTextRef.current[note.id] = e.target.value;
                                    }}
                                    onBlur={(e) => {
                                        const latestText = editingTextRef.current[note.id] ?? e.target.value;

                                        const updatedNote = {
                                            ...note,
                                            text: latestText,
                                            updatedAt: Date.now(),
                                        };

                                        setNotes((prev) =>
                                            prev.map((item) =>
                                                item.id === note.id ? updatedNote : item
                                            )
                                        );

                                        saveBoardItem(updatedNote, "note");

                                        setTimeout(() => {
                                            if (editingNoteIdRef.current === note.id) {
                                                editingNoteIdRef.current = null;
                                            }
                                            delete editingTextRef.current[note.id];
                                        }, 300);
                                    }}
                                    placeholder="내용 입력"
                                    style={{
                                        width: "100%",
                                        height: 115,
                                        border: "none",
                                        outline: "none",
                                        resize: "none",
                                        background: "transparent",
                                        color: "#1f2937",
                                        fontSize: 16,
                                        lineHeight: 1.5,
                                        fontWeight: 600,
                                    }}
                                />

                                <div
                                    style={{
                                        marginTop: 8,
                                        fontSize: 11,
                                        color: "#475569",
                                        display: "flex",
                                        justifyContent: "space-between",
                                    }}
                                >
                                    <span>Lecture AI Board</span>
                                    <span>drag</span>
                                </div>

                                {selected && tool === "select" && (
                                    <div
                                        onMouseDown={(e) => {
                                            e.stopPropagation();

                                            saveHistory();

                                            setResizing({
                                                id: note.id,
                                                startMouseX: e.clientX,
                                                startMouseY: e.clientY,
                                                startWidth: note.width,
                                                startHeight: note.height,
                                            });
                                        }}
                                        style={{
                                            position: "absolute",
                                            right: -8,
                                            bottom: -8,
                                            width: 16,
                                            height: 16,
                                            borderRadius: "50%",
                                            background: "#2563eb",
                                            cursor: "nwse-resize",
                                        }}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>

                {notes.length === 0 && drawings.length === 0 && (
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            color: "#94a3b8",
                            fontWeight: 700,
                            fontSize: 18,
                            pointerEvents: "none",
                        }}
                    >
                        + 메모 또는 펜을 선택해서 보드를 시작하세요.
                    </div>
                )}
            </div>
        </div>
    );
}