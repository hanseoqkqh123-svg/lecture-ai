import React, { useEffect } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
// import "@excalidraw/excalidraw/index.css";

export default function BoardPage({ onBack }) {
    useEffect(() => {
        const originalOverflow = document.body.style.overflow;
        const originalHtmlOverflow = document.documentElement.style.overflow;

        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = originalOverflow;
            document.documentElement.style.overflow = originalHtmlOverflow;
        };
    }, []);

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
        >
            <div style={{ flexShrink: 0, marginBottom: 12 }}>
                <h2 style={{ margin: 0 }}>공동 보드</h2>
                <p className="subText" style={{ marginTop: 6 }}>
                    팀원들과 강의 요약, 발표 흐름, 아이디어를 자유롭게 정리하세요.
                </p>

                <button className="secondaryBtn" onClick={onBack}>
                    ← 팀 프로젝트로 돌아가기
                </button>
            </div>

            <div
                style={{
                    flex: 1,
                    minHeight: 0,
                    position: "relative",
                    overflow: "hidden",
                    borderRadius: 18,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                }}
            >
                <Excalidraw />
            </div>
        </div>
    );
}