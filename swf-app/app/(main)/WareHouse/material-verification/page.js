"use client";

import React, { useState, useEffect, useRef } from "react";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Card } from "primereact/card";
import { TabView, TabPanel } from "primereact/tabview";
import { Button } from "primereact/button";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { getMaterialVerificationData } from "../../../api/material-verification";
import { getDetailedRackMonitoring } from "../../../api/rack-monitoring";
import './material-verification.css';

ChartJS.register(ArcElement, Tooltip, Legend);

const MaterialVerificationDashboard = () => {
    const [loading, setLoading] = useState(false);
    const [verificationData, setVerificationData] = useState([]);
    const [detailedData, setDetailedData] = useState([]); // 상세 모니터링 데이터 추가
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isAutoRefresh, setIsAutoRefresh] = useState(false); // 자동 새로고침 상태
    const [lastRefreshTime, setLastRefreshTime] = useState(null); // 마지막 새로고침 시간
    const tabViewRef = useRef(null);
    const refreshIntervalRef = useRef(null); // 인터벌 참조

    // 전체 화면 토글 함수
    const toggleFullscreen = () => {
        if (!isFullscreen) {
            if (tabViewRef.current) {
                if (tabViewRef.current.requestFullscreen) {
                    tabViewRef.current.requestFullscreen();
                } else if (tabViewRef.current.webkitRequestFullscreen) {
                    tabViewRef.current.webkitRequestFullscreen();
                } else if (tabViewRef.current.msRequestFullscreen) {
                    tabViewRef.current.msRequestFullscreen();
                }
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    };

    // 전체 화면 상태 변경 감지
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('msfullscreenchange', handleFullscreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.removeEventListener('msfullscreenchange', handleFullscreenChange);
        };
    }, []);

    // 데이터 로드
    const loadVerificationData = async () => {
        setLoading(true);
        try {
            const [verData, detData] = await Promise.all([
                getMaterialVerificationData(),
                getDetailedRackMonitoring()
            ]);
            setVerificationData(verData);
            setDetailedData(detData);
            
            // 조회 시간 업데이트
            const now = new Date();
            setLastRefreshTime(now);
            console.log('Data refreshed at:', now.toLocaleString('ko-KR'));
        } catch (error) {
            console.error('Error loading verification data:', error);
            setVerificationData([]);
            setDetailedData([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadVerificationData();
    }, []);

    // 자동 새로고침 토글 함수
    const toggleAutoRefresh = () => {
        setIsAutoRefresh(prev => !prev);
    };

    // 자동 새로고침 효과
    useEffect(() => {
        if (isAutoRefresh) {
            // 5분(300000ms)마다 새로고침
            refreshIntervalRef.current = setInterval(() => {
                console.log('Auto refresh triggered at:', new Date().toLocaleTimeString());
                loadVerificationData();
            }, 300000); // 5분 = 300,000ms

            console.log('Auto refresh enabled - refreshing every 5 minutes');
        } else {
            // 자동 새로고침 비활성화 시 인터벌 정리
            if (refreshIntervalRef.current) {
                clearInterval(refreshIntervalRef.current);
                refreshIntervalRef.current = null;
                console.log('Auto refresh disabled');
            }
        }

        // 컴포넌트 언마운트 시 인터벌 정리
        return () => {
            if (refreshIntervalRef.current) {
                clearInterval(refreshIntervalRef.current);
            }
        };
    }, [isAutoRefresh]);

    // CDNAME별로 데이터 그룹화
    const groupedData = verificationData.reduce((acc, item) => {
        const cdname = item.CDNAME || 'Unknown';
        if (!acc[cdname]) {
            acc[cdname] = [];
        }
        acc[cdname].push(item);
        return acc;
    }, {});

    // 7 Rack과 5 Rack 데이터 분리
    const sevenRackData = groupedData['7 Rack'] || [];
    const fiveRackData = groupedData['5 Rack'] || [];
    
    // 7 Rack 데이터를 25개 행으로 고정하고 컬럼별로 분할
    const sevenRackFixedData = Array.from({ length: 25 }, (_, i) => ({ rowIndex: i }));
    
    // 5 Rack 데이터를 25개 행으로 고정하고 컬럼별로 분할
    const fiveRackFixedData = Array.from({ length: 25 }, (_, i) => ({ rowIndex: i }));
    
    // 7 Rack 컬럼 생성 (데이터를 25개씩 나누어서 컬럼별로 배치)
    const sevenRackColumns = [];
    const sevenRackTotalGrids = Math.ceil(sevenRackData.length / 25); // 160개 / 25 = 7개 Grid
    
    for (let gridIndex = 0; gridIndex < sevenRackTotalGrids; gridIndex++) {
        const startIndex = gridIndex * 25;
        
        // BIN_LOC 컬럼
        sevenRackColumns.push({
            field: `BIN_LOC_${gridIndex}`,
            header: `BIN`,
            body: (rowData) => {
                const dataIndex = startIndex + rowData.rowIndex;
                if (dataIndex < sevenRackData.length) {
                    const item = sevenRackData[dataIndex];
                    const isFlagged1 = item.FLAG1 === 'N';
                    const isFlagged2 = item.FLAG2 === 'N';
                    const isEmpty = item.TOTAL_CNT === 0 || item.TOTAL_CNT === null;
                    // DS0001_ 부분 제거하고 나머지만 표시
                    const displayValue = item.BIN_LOC ? item.BIN_LOC.replace('DS0001_', '') : '';
                    return (
                        <div className={`bin-loc-cell ${isFlagged1 ? 'flagged' : ''} ${isEmpty ? 'empty-rack' : ''}`}>
                            {displayValue}
                        </div>
                    );
                }
                return <div className="empty-cell"></div>;
            },
            style: { minWidth: '70px', maxWidth: '70px' },
            headerStyle: { textAlign: 'center' },
            bodyClassName: (rowData) => {
                const dataIndex = startIndex + rowData.rowIndex;
                if (dataIndex < sevenRackData.length) {
                    const item = sevenRackData[dataIndex];
                    if (item.FLAG2 === 'N') return 'flagged2';
                    if (item.TOTAL_CNT === 0 || item.TOTAL_CNT === null) return 'empty-rack-cell';
                }
                return '';
            }
        });
        
        // BIN_LOCATION_TARGET 컬럼
        sevenRackColumns.push({
            field: `BIN_LOCATION_TARGET_${gridIndex}`,
            header: `TARGET`,
            body: (rowData) => {
                const dataIndex = startIndex + rowData.rowIndex;
                if (dataIndex < sevenRackData.length) {
                    const item = sevenRackData[dataIndex];
                    const isFlagged1 = item.FLAG1 === 'N';
                    const isEmpty = item.TOTAL_CNT === 0 || item.TOTAL_CNT === null;
                    return (
                        <div className={`bin-location-target-cell ${isFlagged1 ? 'flagged' : ''} ${isEmpty ? 'empty-rack' : ''}`}>
                            {item.BIN_LOCATION_TARGET}
                        </div>
                    );
                }
                return <div className="empty-cell"></div>;
            },
            style: { minWidth: '220px', maxWidth: '220px' },
            headerStyle: { textAlign: 'center' },
            bodyClassName: (rowData) => {
                const dataIndex = startIndex + rowData.rowIndex;
                if (dataIndex < sevenRackData.length) {
                    const item = sevenRackData[dataIndex];
                    if (item.FLAG2 === 'N') return 'flagged2';
                    if (item.TOTAL_CNT === 0 || item.TOTAL_CNT === null) return 'empty-rack-cell';
                }
                return '';
            }
        });
        
        // TOTAL_CNT 컬럼
        sevenRackColumns.push({
            field: `TOTAL_CNT_${gridIndex}`,
            header: `CNT`,
            body: (rowData) => {
                const dataIndex = startIndex + rowData.rowIndex;
                if (dataIndex < sevenRackData.length) {
                    const item = sevenRackData[dataIndex];
                    const isFlagged1 = item.FLAG1 === 'N';
                    const isEmpty = item.TOTAL_CNT === 0 || item.TOTAL_CNT === null;
                    return (
                        <div className={`total-cnt-cell ${isFlagged1 ? 'flagged' : ''} ${isEmpty ? 'empty-rack' : ''}`}>
                            {item.TOTAL_CNT || 0}
                        </div>
                    );
                }
                return <div className="empty-cell"></div>;
            },
            style: { minWidth: '50px', maxWidth: '50px', textAlign: 'center' },
            headerStyle: { textAlign: 'center' },
            bodyClassName: (rowData) => {
                const dataIndex = startIndex + rowData.rowIndex;
                if (dataIndex < sevenRackData.length) {
                    const item = sevenRackData[dataIndex];
                    if (item.FLAG2 === 'N') return 'flagged2';
                    if (item.TOTAL_CNT === 0 || item.TOTAL_CNT === null) return 'empty-rack-cell';
                }
                return '';
            }
        });
    }
    
    // 5 Rack 컬럼 생성 (데이터를 25개씩 나누어서 컬럼별로 배치)
    const fiveRackColumns = [];
    const fiveRackTotalGrids = Math.ceil(fiveRackData.length / 25); // 170개 / 25 = 7개 Grid
    
    for (let gridIndex = 0; gridIndex < fiveRackTotalGrids; gridIndex++) {
        const startIndex = gridIndex * 25;
        
        // BIN_LOC 컬럼
        fiveRackColumns.push({
            field: `BIN_LOC_${gridIndex}`,
            header: `BIN`,
            body: (rowData) => {
                const dataIndex = startIndex + rowData.rowIndex;
                if (dataIndex < fiveRackData.length) {
                    const item = fiveRackData[dataIndex];
                    const isFlagged1 = item.FLAG1 === 'N';
                    const isEmpty = item.TOTAL_CNT === 0 || item.TOTAL_CNT === null;
                    // DS0002_ 부분 제거하고 나머지만 표시
                    const displayValue = item.BIN_LOC ? item.BIN_LOC.replace('DS0002_', '') : '';
                    return (
                        <div className={`bin-loc-cell ${isFlagged1 ? 'flagged' : ''} ${isEmpty ? 'empty-rack' : ''}`}>
                            {displayValue}
                        </div>
                    );
                }
                return <div className="empty-cell"></div>;
            },
            style: { minWidth: '70px', maxWidth: '70px' },
            headerStyle: { textAlign: 'center' },
            bodyClassName: (rowData) => {
                const dataIndex = startIndex + rowData.rowIndex;
                if (dataIndex < fiveRackData.length) {
                    const item = fiveRackData[dataIndex];
                    if (item.FLAG2 === 'N') return 'flagged2';
                    if (item.TOTAL_CNT === 0 || item.TOTAL_CNT === null) return 'empty-rack-cell';
                }
                return '';
            }
        });
        
        // BIN_LOCATION_TARGET 컬럼
        fiveRackColumns.push({
            field: `BIN_LOCATION_TARGET_${gridIndex}`,
            header: `TARGET`,
            body: (rowData) => {
                const dataIndex = startIndex + rowData.rowIndex;
                if (dataIndex < fiveRackData.length) {
                    const item = fiveRackData[dataIndex];
                    const isFlagged1 = item.FLAG1 === 'N';
                    const isEmpty = item.TOTAL_CNT === 0 || item.TOTAL_CNT === null;
                    return (
                        <div className={`bin-location-target-cell ${isFlagged1 ? 'flagged' : ''} ${isEmpty ? 'empty-rack' : ''}`}>
                            {item.BIN_LOCATION_TARGET}
                        </div>
                    );
                }
                return <div className="empty-cell"></div>;
            },
            style: { minWidth: '220px', maxWidth: '220px' },
            headerStyle: { textAlign: 'center' },
            bodyClassName: (rowData) => {
                const dataIndex = startIndex + rowData.rowIndex;
                if (dataIndex < fiveRackData.length) {
                    const item = fiveRackData[dataIndex];
                    if (item.FLAG2 === 'N') return 'flagged2';
                    if (item.TOTAL_CNT === 0 || item.TOTAL_CNT === null) return 'empty-rack-cell';
                }
                return '';
            }
        });
        
        // TOTAL_CNT 컬럼
        fiveRackColumns.push({
            field: `TOTAL_CNT_${gridIndex}`,
            header: `CNT`,
            body: (rowData) => {
                const dataIndex = startIndex + rowData.rowIndex;
                if (dataIndex < fiveRackData.length) {
                    const item = fiveRackData[dataIndex];
                    const isFlagged1 = item.FLAG1 === 'N';
                    const isEmpty = item.TOTAL_CNT === 0 || item.TOTAL_CNT === null;
                    return (
                        <div className={`total-cnt-cell ${isFlagged1 ? 'flagged' : ''} ${isEmpty ? 'empty-rack' : ''}`}>
                            {item.TOTAL_CNT || 0}
                        </div>
                    );
                }
                return <div className="empty-cell"></div>;
            },
            style: { minWidth: '50px', maxWidth: '50px', textAlign: 'center' },
            headerStyle: { textAlign: 'center' },
            bodyClassName: (rowData) => {
                const dataIndex = startIndex + rowData.rowIndex;
                if (dataIndex < fiveRackData.length) {
                    const item = fiveRackData[dataIndex];
                    if (item.FLAG2 === 'N') return 'flagged2';
                    if (item.TOTAL_CNT === 0 || item.TOTAL_CNT === null) return 'empty-rack-cell';
                }
                return '';
            }
        });
    }

    // 컬럼 템플릿
    const binLocBodyTemplate = (rowData) => {
        if (rowData.isEmpty) return <div className="empty-cell"></div>;
        const isFlagged1 = rowData.FLAG1 === 'N';
        return (
            <div className={`bin-loc-cell ${isFlagged1 ? 'flagged' : ''}`}>
                {rowData.BIN_LOC}
            </div>
        );
    };

    const binLocationTargetBodyTemplate = (rowData) => {
        if (rowData.isEmpty) return <div className="empty-cell"></div>;
        const isFlagged1 = rowData.FLAG1 === 'N';
        return (
            <div className={`bin-location-target-cell ${isFlagged1 ? 'flagged' : ''}`}>
                {rowData.BIN_LOCATION_TARGET}
            </div>
        );
    };

    const totalCntBodyTemplate = (rowData) => {
        if (rowData.isEmpty) return <div className="empty-cell"></div>;
        const isFlagged1 = rowData.FLAG1 === 'N';
        return (
            <div className={`total-cnt-cell ${isFlagged1 ? 'flagged' : ''}`}>
                {rowData.TOTAL_CNT || 0}
            </div>
        );
    };

    const [activeTab, setActiveTab] = useState(0);

    // 시간 포맷 함수 (HH:MM:SS DD/MM/YYYY)
    const formatRefreshTime = (date) => {
        if (!date) return '';
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${hours}:${minutes}:${seconds} ${day}/${month}/${year}`;
    };

    // 도넛 차트 데이터 계산 함수
    const calculateChartData = (rackData, rackType) => {
        const totalLocations = rackData.length;
        const maxCellsPerRack = rackType === '7 Rack' ? 7 : 5;
        const totalCells = totalLocations * maxCellsPerRack;
        
        // 1. Bin Location 차트 데이터
        const occupiedLocations = rackData.filter(item => item.TOTAL_CNT > 0).length;
        const availableLocations = totalLocations - occupiedLocations;
        
        const locationChartData = {
            labels: ['Occupied', 'Available'],
            datasets: [{
                data: [occupiedLocations, availableLocations],
                backgroundColor: ['#667eea', '#e0e0e0'],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        };
        
        // 2. Bin Cell 차트 데이터
        const occupiedCells = rackData.reduce((sum, item) => sum + (item.TOTAL_CNT || 0), 0);
        const availableCells = totalCells - occupiedCells;
        
        const cellChartData = {
            labels: ['Occupied', 'Available'],
            datasets: [{
                data: [occupiedCells, availableCells],
                backgroundColor: ['#764ba2', '#e0e0e0'],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        };
        
        // 3. Length Status 차트 데이터 (detailedData 사용)
        // detailedData에서 해당 rack type만 필터링
        const rackDetailedData = detailedData.filter(item => item.cdname === rackType);
        const shortLengthCount = rackDetailedData.filter(item => item.flag1 === 'N').length;
        const normalLengthCount = rackDetailedData.filter(item => item.flag1 === 'Y').length;
        
        const flag1ChartData = {
            labels: ['Short Length', 'Normal Length'],
            datasets: [{
                data: [shortLengthCount, normalLengthCount],
                backgroundColor: ['#080808', '#4CAF50'],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        };
        
        // 4. Item Status 차트 데이터 (detailedData 사용)
        const wrongItemCount = rackDetailedData.filter(item => item.flag2 === 'N').length;
        const correctItemCount = rackDetailedData.filter(item => item.flag2 === 'Y').length;
        
        const flag2ChartData = {
            labels: ['Wrong Item', 'Correct Item'],
            datasets: [{
                data: [wrongItemCount, correctItemCount],
                backgroundColor: ['#f70505', '#4CAF50'],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        };
        
        return {
            locationChart: locationChartData,
            cellChart: cellChartData,
            flag1Chart: flag1ChartData,
            flag2Chart: flag2ChartData,
            stats: {
                totalLocations,
                occupiedLocations,
                availableLocations,
                totalCells,
                occupiedCells,
                availableCells,
                shortLengthCount,
                wrongItemCount,
                normalLengthCount,
                correctItemCount
            }
        };
    };

    // 7 Rack과 5 Rack 차트 데이터
    const sevenRackChartData = calculateChartData(sevenRackData, '7 Rack');
    const fiveRackChartData = calculateChartData(fiveRackData, '5 Rack');

    // 차트 옵션 생성 함수 (범례에 숫자 포함)
    const createChartOptions = (data) => ({
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    font: {
                        size: 14,
                        weight: 'bold'
                    },
                    padding: 15,
                    generateLabels: function(chart) {
                        const data = chart.data;
                        if (data.labels.length && data.datasets.length) {
                            return data.labels.map((label, i) => {
                                const value = data.datasets[0].data[i];
                                const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return {
                                    text: `${label}: ${value} (${percentage}%)`,
                                    fillStyle: data.datasets[0].backgroundColor[i],
                                    hidden: false,
                                    index: i
                                };
                            });
                        }
                        return [];
                    }
                }
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const label = context.label || '';
                        const value = context.parsed || 0;
                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                        const percentage = ((value / total) * 100).toFixed(1);
                        return `${label}: ${value} (${percentage}%)`;
                    }
                }
            }
        }
    });

    return (
        <div className="material-verification-dashboard">
            {/* 최소화된 상단 헤더 */}
            <div className="compact-header">
                <h1>SWR Factory RACK Material Verification</h1>
                <div className="header-controls">
                    <Button
                        icon={isAutoRefresh ? "pi pi-pause" : "pi pi-sync"}
                        onClick={toggleAutoRefresh}
                        tooltip={isAutoRefresh ? "Stop Auto Refresh (5min)" : "Start Auto Refresh (5min)"}
                        tooltipOptions={{ position: 'bottom' }}
                        className={`p-button-sm p-button-text ${isAutoRefresh ? 'auto-refresh-active' : ''}`}
                        severity={isAutoRefresh ? "success" : "secondary"}
                    />
                    <Button
                        icon={isFullscreen ? "pi pi-window-minimize" : "pi pi-window-maximize"}
                        onClick={toggleFullscreen}
                        tooltip={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                        tooltipOptions={{ position: 'bottom' }}
                        className="p-button-sm p-button-text"
                        severity="secondary"
                    />
                    <Button 
                        icon="pi pi-refresh"
                        onClick={loadVerificationData}
                        disabled={loading}
                        loading={loading}
                        tooltip="Refresh Now"
                        tooltipOptions={{ position: 'bottom' }}
                        className="p-button-sm p-button-text"
                        severity="secondary"
                    />
                </div>
            </div>

            {/* 사이드바 + 메인 컨텐츠 레이아웃 */}
            <div className="dashboard-layout" ref={tabViewRef}>
                {/* 왼쪽 탭 사이드바 */}
                <div className="sidebar-tabs">
                    <div 
                        className={`tab-item ${activeTab === 0 ? 'active' : ''}`}
                        onClick={() => setActiveTab(0)}
                    >
                        <i className="pi pi-box"></i>
                        <span>7 Rack</span>
                    </div>
                    <div 
                        className={`tab-item ${activeTab === 1 ? 'active' : ''}`}
                        onClick={() => setActiveTab(1)}
                    >
                        <i className="pi pi-box"></i>
                        <span>5 Rack</span>
                    </div>
                </div>

                {/* 메인 컨텐츠 영역 */}
                <div className="main-content">
                    {activeTab === 0 && (
                        <div className="grid-container">
                            <div className="grid-header">
                                <div className="header-left">
                                    <h3>7 Rack - Material Verification</h3>
                                    {lastRefreshTime && (
                                        <div className="refresh-time">
                                            <i className="pi pi-clock"></i>
                                            <span>Last Updated: {formatRefreshTime(lastRefreshTime)}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flag-legend">
                                    <div className="flag-item">
                                        <div className="flag-indicator flag1-indicator"></div>
                                        <span>SHORT LENGTH</span>
                                    </div>
                                    <div className="flag-item">
                                        <div className="flag-indicator flag2-indicator"></div>
                                        <span>WRONG ITEM</span>
                                    </div>
                                    <div className="flag-item">
                                        <div className="flag-indicator empty-rack-indicator"></div>
                                        <span>EMPTY RACK</span>
                                    </div>
                                </div>
                            </div>
                            <div className="grid-content">
                                <DataTable 
                                    value={sevenRackFixedData} 
                                    showGridlines 
                                    className="grid-table"
                                    scrollable 
                                    scrollHeight="calc(100vh - 420px)"
                                >
                                    {sevenRackColumns.map((column, index) => (
                                        <Column 
                                            key={index}
                                            field={column.field} 
                                            header={column.header} 
                                            body={column.body}
                                            style={column.style}
                                            headerStyle={column.headerStyle}
                                            bodyClassName={column.bodyClassName}
                                        />
                                    ))}
                                </DataTable>
                            </div>
                            
                            {/* 도넛 차트 섹션 */}
                            <div className="charts-section">
                                <div className="chart-card">
                                    <h4>Bin Location</h4>
                                    <div className="chart-wrapper">
                                        <Doughnut data={sevenRackChartData.locationChart} options={createChartOptions(sevenRackChartData.locationChart)} />
                                    </div>
                                </div>
                                
                                <div className="chart-card">
                                    <h4>Bin Cell</h4>
                                    <div className="chart-wrapper">
                                        <Doughnut data={sevenRackChartData.cellChart} options={createChartOptions(sevenRackChartData.cellChart)} />
                                    </div>
                                </div>
                                
                                <div className="chart-card">
                                    <h4>Length Status</h4>
                                    <div className="chart-wrapper">
                                        <Doughnut data={sevenRackChartData.flag1Chart} options={createChartOptions(sevenRackChartData.flag1Chart)} />
                                    </div>
                                </div>
                                
                                <div className="chart-card">
                                    <h4>Item Status</h4>
                                    <div className="chart-wrapper">
                                        <Doughnut data={sevenRackChartData.flag2Chart} options={createChartOptions(sevenRackChartData.flag2Chart)} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {activeTab === 1 && (
                        <div className="grid-container">
                            <div className="grid-header">
                                <div className="header-left">
                                    <h3>5 Rack - Material Verification</h3>
                                    {lastRefreshTime && (
                                        <div className="refresh-time">
                                            <i className="pi pi-clock"></i>
                                            <span>Last Updated: {formatRefreshTime(lastRefreshTime)}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flag-legend">
                                    <div className="flag-item">
                                        <div className="flag-indicator flag1-indicator"></div>
                                        <span>SHORT LENGTH</span>
                                    </div>
                                    <div className="flag-item">
                                        <div className="flag-indicator flag2-indicator"></div>
                                        <span>WRONG ITEM</span>
                                    </div>
                                    <div className="flag-item">
                                        <div className="flag-indicator empty-rack-indicator"></div>
                                        <span>EMPTY RACK</span>
                                    </div>
                                </div>
                            </div>
                            <div className="grid-content">
                                <DataTable 
                                    value={fiveRackFixedData} 
                                    showGridlines 
                                    className="grid-table"
                                    scrollable 
                                    scrollHeight="calc(100vh - 420px)"
                                >
                                    {fiveRackColumns.map((column, index) => (
                                        <Column 
                                            key={index}
                                            field={column.field} 
                                            header={column.header} 
                                            body={column.body}
                                            style={column.style}
                                            headerStyle={column.headerStyle}
                                            bodyClassName={column.bodyClassName}
                                        />
                                    ))}
                                </DataTable>
                            </div>
                            
                            {/* 도넛 차트 섹션 */}
                            <div className="charts-section">
                                <div className="chart-card">
                                    <h4>Bin Location</h4>
                                    <div className="chart-wrapper">
                                        <Doughnut data={fiveRackChartData.locationChart} options={createChartOptions(fiveRackChartData.locationChart)} />
                                    </div>
                                </div>
                                
                                <div className="chart-card">
                                    <h4>Bin Cell</h4>
                                    <div className="chart-wrapper">
                                        <Doughnut data={fiveRackChartData.cellChart} options={createChartOptions(fiveRackChartData.cellChart)} />
                                    </div>
                                </div>
                                
                                <div className="chart-card">
                                    <h4>Length Status</h4>
                                    <div className="chart-wrapper">
                                        <Doughnut data={fiveRackChartData.flag1Chart} options={createChartOptions(fiveRackChartData.flag1Chart)} />
                                    </div>
                                </div>
                                
                                <div className="chart-card">
                                    <h4>Item Status</h4>
                                    <div className="chart-wrapper">
                                        <Doughnut data={fiveRackChartData.flag2Chart} options={createChartOptions(fiveRackChartData.flag2Chart)} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MaterialVerificationDashboard; 