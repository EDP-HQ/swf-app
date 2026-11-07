"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import {
    fetchM2bVerificationData,
    formatTargetDisplay
} from "@/lib/material-verification-m2b/fetchM2bVerification";
import "../material-verification/material-verification.css";
import "./material-verification-m2b.css";

function buildRackColumns(rackData, gridCount) {
    const columns = [];
    const fixedData = Array.from({ length: 25 }, (_, i) => ({ rowIndex: i }));

    for (let gridIndex = 0; gridIndex < gridCount; gridIndex++) {
        const startIndex = gridIndex * 25;

        columns.push({
            field: `BIN_LOC_${gridIndex}`,
            header: "BIN",
            body: (rowData) => {
                const dataIndex = startIndex + rowData.rowIndex;
                if (dataIndex >= rackData.length) return <div className="empty-cell" />;
                const item = rackData[dataIndex];
                const isFlagged1 = item.FLAG1 === "N";
                const isEmpty = !item.TOTAL_CNT;
                const displayValue = item.BIN_LOC ? item.BIN_LOC.replace(/^DS000[12]_/, "") : "";
                return (
                    <div
                        className={`bin-loc-cell ${isFlagged1 ? "flagged" : ""} ${isEmpty ? "empty-rack" : ""}`}
                        title={item.BIN_LOC}
                    >
                        {displayValue}
                    </div>
                );
            },
            bodyClassName: (rowData) => {
                const dataIndex = startIndex + rowData.rowIndex;
                if (dataIndex >= rackData.length) return "";
                const item = rackData[dataIndex];
                if (item.FLAG2 === "N") return "flagged2";
                if (!item.TOTAL_CNT) return "empty-rack-cell";
                return "";
            }
        });

        columns.push({
            field: `TARGET_${gridIndex}`,
            header: "TARGET (material list)",
            body: (rowData) => {
                const dataIndex = startIndex + rowData.rowIndex;
                if (dataIndex >= rackData.length) return <div className="empty-cell" />;
                const item = rackData[dataIndex];
                const isFlagged1 = item.FLAG1 === "N";
                const isEmpty = !item.TOTAL_CNT;
                const hint =
                    item.SUGGESTION_MATERIAL_CNT === 0 && item.TOTAL_CNT > 0
                        ? "No grade assigned to this bin on material list"
                        : undefined;
                return (
                    <div
                        className={`bin-location-target-cell ${isFlagged1 ? "flagged" : ""} ${isEmpty ? "empty-rack" : ""}`}
                        title={hint}
                    >
                        {formatTargetDisplay(item.BIN_LOCATION_TARGET) || (hint ? "— (no assignment)" : "")}
                    </div>
                );
            },
            style: { minWidth: "220px", maxWidth: "280px" },
            bodyClassName: (rowData) => {
                const dataIndex = startIndex + rowData.rowIndex;
                if (dataIndex >= rackData.length) return "";
                const item = rackData[dataIndex];
                if (item.FLAG2 === "N") return "flagged2";
                if (!item.TOTAL_CNT) return "empty-rack-cell";
                return "";
            }
        });

        columns.push({
            field: `CNT_${gridIndex}`,
            header: "CNT",
            body: (rowData) => {
                const dataIndex = startIndex + rowData.rowIndex;
                if (dataIndex >= rackData.length) return <div className="empty-cell" />;
                const item = rackData[dataIndex];
                const isFlagged1 = item.FLAG1 === "N";
                const isEmpty = !item.TOTAL_CNT;
                return (
                    <div className={`total-cnt-cell ${isFlagged1 ? "flagged" : ""} ${isEmpty ? "empty-rack" : ""}`}>
                        {item.TOTAL_CNT || 0}
                    </div>
                );
            },
            style: { minWidth: "50px", maxWidth: "50px", textAlign: "center" },
            bodyClassName: (rowData) => {
                const dataIndex = startIndex + rowData.rowIndex;
                if (dataIndex >= rackData.length) return "";
                const item = rackData[dataIndex];
                if (item.FLAG2 === "N") return "flagged2";
                if (!item.TOTAL_CNT) return "empty-rack-cell";
                return "";
            }
        });
    }

    return { columns, fixedData };
}

export default function MaterialVerificationM2bPage() {
    const [loading, setLoading] = useState(false);
    const [verificationData, setVerificationData] = useState([]);
    const [activeTab, setActiveTab] = useState(0);
    const [lastRefreshTime, setLastRefreshTime] = useState(null);
    const [error, setError] = useState(null);
    const tabViewRef = useRef(null);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const rows = await fetchM2bVerificationData();
            setVerificationData(rows);
            setLastRefreshTime(new Date());
        } catch (e) {
            setVerificationData([]);
            setError(e instanceof Error ? e.message : "Failed to load");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const grouped = useMemo(() => {
        return verificationData.reduce((acc, item) => {
            const key = item.CDNAME || "Unknown";
            if (!acc[key]) acc[key] = [];
            acc[key].push(item);
            return acc;
        }, {});
    }, [verificationData]);

    const sevenRackData = grouped["7 Rack"] || [];
    const fiveRackData = grouped["5 Rack"] || [];
    const activeRack = activeTab === 0 ? sevenRackData : fiveRackData;

    const stats = useMemo(() => {
        const wrong = activeRack.filter((r) => r.FLAG2 === "N").length;
        const withAssignment = activeRack.filter((r) => (r.SUGGESTION_MATERIAL_CNT || 0) > 0).length;
        return { wrong, total: activeRack.length, withAssignment };
    }, [activeRack]);

    const sevenGrid = buildRackColumns(sevenRackData, Math.ceil(sevenRackData.length / 25) || 1);
    const fiveGrid = buildRackColumns(fiveRackData, Math.ceil(fiveRackData.length / 25) || 1);
    const grid = activeTab === 0 ? sevenGrid : fiveGrid;

    const formatRefreshTime = (date) => {
        if (!date) return "";
        const pad = (n) => String(n).padStart(2, "0");
        return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
    };

    return (
        <div className="material-verification-dashboard">
            <div className="m2b-banner">
                <strong>Material → Bin verification (new)</strong>
                <span className="m2b-subtitle">
                    TARGET &amp; red/green from KBAS010 <code>TB_CD_MATERIAL.BIN_LOCATION_CD</code> — legacy screen unchanged.
                </span>
                <span className="m2b-link">
                    <Link href="/WareHouse/material-verification">Open classic (bin master) verification</Link>
                </span>
            </div>

            <div className="compact-header">
                <h1>SWR RACK Verification — Material List Rules</h1>
                <div className="header-controls">
                    <Button
                        icon="pi pi-refresh"
                        onClick={loadData}
                        disabled={loading}
                        loading={loading}
                        tooltip="Refresh"
                        className="p-button-sm p-button-text"
                        severity="secondary"
                    />
                </div>
            </div>

            {error ? (
                <div className="m2b-banner" style={{ background: "#8b1a1a" }}>
                    {error}
                    <span className="m2b-subtitle">Deploy SP on SFC_WR_DB and run swf-api with sfcwrdb.</span>
                </div>
            ) : null}

            <div className="dashboard-layout" ref={tabViewRef}>
                <div className="sidebar-tabs">
                    <div className={`tab-item ${activeTab === 0 ? "active" : ""}`} onClick={() => setActiveTab(0)}>
                        <i className="pi pi-box" />
                        <span>7 Rack</span>
                    </div>
                    <div className={`tab-item ${activeTab === 1 ? "active" : ""}`} onClick={() => setActiveTab(1)}>
                        <i className="pi pi-box" />
                        <span>5 Rack</span>
                    </div>
                </div>

                <div className="main-content">
                    <div className="grid-container">
                        <div className="grid-header">
                            <div className="header-left">
                                <h3>{activeTab === 0 ? "7 Rack" : "5 Rack"} — M2B</h3>
                                {lastRefreshTime ? (
                                    <div className="refresh-time">
                                        <i className="pi pi-clock" />
                                        <span>Last updated: {formatRefreshTime(lastRefreshTime)}</span>
                                    </div>
                                ) : null}
                                <div className="m2b-subtitle" style={{ color: "#444", marginTop: "0.25rem" }}>
                                    Bins with material-list assignment: {stats.withAssignment} / {stats.total} · Wrong
                                    item (red): {stats.wrong}
                                </div>
                            </div>
                            <div className="flag-legend">
                                <div className="flag-item">
                                    <div className="flag-indicator flag2-indicator" />
                                    <span>WRONG / NO LIST MATCH</span>
                                </div>
                                <div className="flag-item">
                                    <div className="flag-indicator empty-rack-indicator" />
                                    <span>EMPTY RACK</span>
                                </div>
                            </div>
                        </div>
                        <div className="grid-content">
                            <DataTable
                                value={grid.fixedData}
                                showGridlines
                                className="grid-table"
                                scrollable
                                scrollHeight="calc(100vh - 380px)"
                            >
                                {grid.columns.map((col, idx) => (
                                    <Column
                                        key={`${col.field}-${idx}`}
                                        field={col.field}
                                        header={col.header}
                                        body={col.body}
                                        style={col.style}
                                        bodyClassName={col.bodyClassName}
                                    />
                                ))}
                            </DataTable>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
