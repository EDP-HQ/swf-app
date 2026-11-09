"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { RackVerificationCharts } from "@/lib/material-verification-m2b/RackVerificationCharts";

ChartJS.register(ArcElement, Tooltip, Legend);
import {
    fetchM2bVerificationData,
    formatTargetDisplay,
    isM2bEmptyRackSlot,
    rackSlotHoverTitle
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
                const isEmpty = isM2bEmptyRackSlot(item);
                const hoverTitle = rackSlotHoverTitle(item) ?? item.BIN_LOC;
                const displayValue = item.BIN_LOC ? item.BIN_LOC.replace(/^DS000[12]_/, "") : "";
                return (
                    <div
                        className={`bin-loc-cell ${isFlagged1 ? "flagged" : ""} ${isEmpty ? "empty-rack" : ""}`}
                        title={hoverTitle}
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
                if (isM2bEmptyRackSlot(item)) return "empty-rack-cell";
                return "";
            }
        });

        columns.push({
            field: `TARGET_${gridIndex}`,
            header: "TARGET",
            body: (rowData) => {
                const dataIndex = startIndex + rowData.rowIndex;
                if (dataIndex >= rackData.length) return <div className="empty-cell" />;
                const item = rackData[dataIndex];
                const isFlagged1 = item.FLAG1 === "N";
                const isEmpty = isM2bEmptyRackSlot(item);
                const hoverTitle = rackSlotHoverTitle(item);
                return (
                    <div
                        className={`bin-location-target-cell ${isFlagged1 ? "flagged" : ""} ${isEmpty ? "empty-rack" : ""}`}
                        title={hoverTitle}
                    >
                        {formatTargetDisplay(item.BIN_LOCATION_TARGET)}
                    </div>
                );
            },
            style: { minWidth: "220px", maxWidth: "280px" },
            bodyClassName: (rowData) => {
                const dataIndex = startIndex + rowData.rowIndex;
                if (dataIndex >= rackData.length) return "";
                const item = rackData[dataIndex];
                if (item.FLAG2 === "N") return "flagged2";
                if (isM2bEmptyRackSlot(item)) return "empty-rack-cell";
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
                const isEmpty = isM2bEmptyRackSlot(item);
                const hoverTitle = rackSlotHoverTitle(item);
                return (
                    <div
                        className={`total-cnt-cell ${isFlagged1 ? "flagged" : ""} ${isEmpty ? "empty-rack" : ""}`}
                        title={hoverTitle}
                    >
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
                if (isM2bEmptyRackSlot(item)) return "empty-rack-cell";
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
    const sevenGrid = buildRackColumns(sevenRackData, Math.ceil(sevenRackData.length / 25) || 1);
    const fiveGrid = buildRackColumns(fiveRackData, Math.ceil(fiveRackData.length / 25) || 1);

    const formatRefreshTime = (date) => {
        if (!date) return "";
        const pad = (n) => String(n).padStart(2, "0");
        return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
    };

    return (
        <div className="material-verification-dashboard">
            <div className="compact-header">
                <h1>SWR RACK Verification — Material → Bin</h1>
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
                    {activeTab === 0 && (
                        <div className="grid-container">
                            <div className="grid-header">
                                <div className="header-left">
                                    <h3>7 Rack — M2B</h3>
                                    {lastRefreshTime ? (
                                        <div className="refresh-time">
                                            <i className="pi pi-clock" />
                                            <span>Last updated: {formatRefreshTime(lastRefreshTime)}</span>
                                        </div>
                                    ) : null}
                                </div>
                                <div className="flag-legend">
                                    <div className="flag-item">
                                        <div className="flag-indicator flag1-indicator" />
                                        <span>SHORT LENGTH</span>
                                    </div>
                                    <div className="flag-item">
                                        <div className="flag-indicator flag2-indicator" />
                                        <span>WRONG ITEM</span>
                                    </div>
                                    <div className="flag-item">
                                        <div className="flag-indicator empty-rack-indicator" />
                                        <span>EMPTY RACK</span>
                                    </div>
                                </div>
                            </div>
                            <div className="grid-content">
                                <DataTable
                                    value={sevenGrid.fixedData}
                                    showGridlines
                                    className="grid-table"
                                    scrollable
                                    scrollHeight="calc(100vh - 420px)"
                                >
                                    {sevenGrid.columns.map((col, idx) => (
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
                            <RackVerificationCharts rackData={sevenRackData} rackType="7 Rack" />
                        </div>
                    )}

                    {activeTab === 1 && (
                        <div className="grid-container">
                            <div className="grid-header">
                                <div className="header-left">
                                    <h3>5 Rack — M2B</h3>
                                    {lastRefreshTime ? (
                                        <div className="refresh-time">
                                            <i className="pi pi-clock" />
                                            <span>Last updated: {formatRefreshTime(lastRefreshTime)}</span>
                                        </div>
                                    ) : null}
                                </div>
                                <div className="flag-legend">
                                    <div className="flag-item">
                                        <div className="flag-indicator flag1-indicator" />
                                        <span>SHORT LENGTH</span>
                                    </div>
                                    <div className="flag-item">
                                        <div className="flag-indicator flag2-indicator" />
                                        <span>WRONG ITEM</span>
                                    </div>
                                    <div className="flag-item">
                                        <div className="flag-indicator empty-rack-indicator" />
                                        <span>EMPTY RACK</span>
                                    </div>
                                </div>
                            </div>
                            <div className="grid-content">
                                <DataTable
                                    value={fiveGrid.fixedData}
                                    showGridlines
                                    className="grid-table"
                                    scrollable
                                    scrollHeight="calc(100vh - 420px)"
                                >
                                    {fiveGrid.columns.map((col, idx) => (
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
                            <RackVerificationCharts rackData={fiveRackData} rackType="5 Rack" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
