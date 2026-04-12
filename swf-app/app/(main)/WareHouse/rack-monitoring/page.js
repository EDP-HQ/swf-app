"use client";

import React, { useState, useRef, useEffect } from "react";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { Card } from "primereact/card";
import { ProgressBar } from "primereact/progressbar";
import { Chart } from 'primereact/chart';
import { Tag } from 'primereact/tag';
import { Badge } from 'primereact/badge';
import { Panel } from 'primereact/panel';
import { Dialog } from 'primereact/dialog';
import { TabView, TabPanel } from 'primereact/tabview';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import * as XLSX from 'xlsx';
import { 
    getDashboardOverview, 
    getRealTimeMonitoring,
    getRackDetail,
    getAbnormalData,
    getDetailedRackMonitoring,
    createWebSocketConnection 
} from "../../../api/rack-monitoring";
import './rack-monitoring.css';

// Chart.js에 datalabels 플러그인 등록
import { Chart as ChartJS } from 'chart.js';
ChartJS.register(ChartDataLabels);

const RackMonitoringDashboard = () => {
    const [loading, setLoading] = useState(false);
    const [isAutoRefresh, setIsAutoRefresh] = useState(false);
    const [refreshInterval, setRefreshInterval] = useState(null);
    
    // 대시보드 데이터 상태
    const [dashboardData, setDashboardData] = useState({
        totalRacks: 0,
        occupiedRacks: 0,
        availableRacks: 0,
        utilizationRate: 0,
        totalProducts: 0,
        activeTags: 0,
        inactiveTags: 0,
        // Rack Type별 수량 추가
        rackTypeCounts: {
            '7 Rack': 0,
            '5 Rack': 0,
            '1 Rack': 0,
            'RW-B': 0
        }
    });

    // 실시간 모니터링 데이터
    const [monitoringData, setMonitoringData] = useState([]);
    
    // 상세 모니터링 데이터
    const [detailedMonitoringData, setDetailedMonitoringData] = useState([]);
    
    // WebSocket 연결
    const [wsConnection, setWsConnection] = useState(null);
    
    // 상세보기 팝업 상태
    const [detailDialogVisible, setDetailDialogVisible] = useState(false);
    const [selectedRackDetail, setSelectedRackDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    
    // 차트 데이터
    const [chartData, setChartData] = useState({
        utilization: {
            labels: ['Occupied', 'Available'],
            datasets: [{
                data: [0, 0],
                backgroundColor: ['#4CAF50', '#FF9800'],
                borderWidth: 0
            }]
        },
        productStatus: {
            labels: ['Normal Products', 'Abnormal Products'],
            datasets: [{
                data: [0, 0],
                backgroundColor: ['#4CAF50', '#F44336'],
                borderWidth: 0
            }]
        },
        abnormal: {
            labels: [],
            datasets: [{
                label: 'Abnormal Count',
                data: [],
                backgroundColor: [],
                borderColor: [],
                borderWidth: 1
            }]
        }
    });

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom'
            },
            tooltip: {
                enabled: true,
                mode: 'index',
                intersect: false
            }
        }
    };

    const doughnutOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                display: true
            },
            tooltip: {
                enabled: true,
                callbacks: {
                    label: function(context) {
                        const label = context.label || '';
                        const value = context.parsed;
                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                        const percentage = ((value / total) * 100).toFixed(1);
                        return `${label}: ${value} (${percentage}%)`;
                    }
                }
            },
            datalabels: {
                color: '#000',
                font: {
                    size: 18
                },
                formatter: function(value, context) {
                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                    const percentage = ((value / total) * 100).toFixed(1);
                    return `${value}\n(${percentage} %)`;
                },
                // display: context.parsed > 0
            }
        }
    };

    const barOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                display: true
            },
            tooltip: {
                enabled: true,
                callbacks: {
                    label: function(context) {
                        return `${context.dataset.label}: ${context.parsed.y}`;
                    }
                }
            },
            datalabels: {
                color: '#000',
                font: {
                    size: 14,
                    weight: 'bold'
                },
                formatter: function(value) {
                    return value;
                },
                anchor: 'end',
                align: 'top',
                offset: 4
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'Count'
                }
            },
            x: {
                title: {
                    display: true,
                    text: 'Root Cause'
                }
            }
        }
    };

    // 데이터가 없을 때 표시할 메시지 컴포넌트
    const NoDataMessage = ({ message = "No Data Available" }) => (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '200px',
            color: '#666',
            fontSize: '1.1rem'
        }}>
            <i className="pi pi-info-circle" style={{ fontSize: '3rem', marginBottom: '1rem', color: '#ccc' }}></i>
            <p>{message}</p>
        </div>
    );

    // 자동 새로고침 설정
    useEffect(() => {
        if (isAutoRefresh) {
            const interval = setInterval(() => {
                loadDashboardData();
            }, 30000); // 30초마다 새로고침
            setRefreshInterval(interval);
        } else {
            if (refreshInterval) {
                clearInterval(refreshInterval);
                setRefreshInterval(null);
            }
        }

        return () => {
            if (refreshInterval) {
                clearInterval(refreshInterval);
            }
        };
    }, [isAutoRefresh]);

    // 초기 데이터 로드
    useEffect(() => {
        loadDashboardData();
    }, []);

    // 대시보드 데이터 로드
    const loadDashboardData = async () => {
        setLoading(true);
        try {
            const [overviewData, monitoringData, abnormalData, detailedData] = await Promise.all([
                getDashboardOverview(),
                getRealTimeMonitoring(),
                getAbnormalData(),
                getDetailedRackMonitoring()
            ]);
            
            setDashboardData(overviewData);
            setMonitoringData(monitoringData);
            setDetailedMonitoringData(detailedData);
            updateChartData(overviewData, abnormalData);
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    // WebSocket 연결 설정
    useEffect(() => {
        if (isAutoRefresh) {
            const ws = createWebSocketConnection((data) => {
                // 실시간 데이터 업데이트
                if (data.type === 'rack_update') {
                    setMonitoringData(prevData => 
                        prevData.map(rack => 
                            rack.rackId === data.rackId ? { ...rack, ...data.updates } : rack
                        )
                    );
                }
            });
            
            setWsConnection(ws);
            
            return () => {
                if (ws) {
                    ws.close();
                }
            };
        }
    }, [isAutoRefresh]);

    // 차트 데이터 업데이트
    const updateChartData = (dashboardData, abnormalData) => {
        // Utilization 차트 데이터 업데이트
        setChartData(prevData => ({
            ...prevData,
            utilization: {
                labels: ['Occupied', 'Available'],
                datasets: [{
                    data: [dashboardData.occupiedRacks, dashboardData.availableRacks],
                    backgroundColor: ['#4CAF50', '#FF9800'],
                    borderWidth: 0
                }]
            },
            productStatus: {
                labels: ['Normal Products', 'Abnormal Products'],
                datasets: [{
                    data: [dashboardData.activeTags, dashboardData.inactiveTags],
                    backgroundColor: ['#4CAF50', '#F44336'],
                    borderWidth: 0
                }]
            },
            abnormal: abnormalData
        }));
    };

    // 자동 새로고침 토글
    const toggleAutoRefresh = () => {
        setIsAutoRefresh(!isAutoRefresh);
    };

    // 상세보기 팝업 열기
    const openDetailDialog = async (rackId) => {
        setDetailLoading(true);
        setDetailDialogVisible(true);
        
        try {
            const detailData = await getRackDetail(rackId);
            setSelectedRackDetail(detailData);
        } catch (error) {
            console.error('Error loading rack detail:', error);
            setSelectedRackDetail(null);
        } finally {
            setDetailLoading(false);
        }
    };

    // 상세보기 팝업 닫기
    const closeDetailDialog = () => {
        setDetailDialogVisible(false);
        setSelectedRackDetail(null);
    };

    // 엑셀 다운로드 함수
    const downloadExcel = () => {
        if (!monitoringData || monitoringData.length === 0) {
            alert('다운로드할 데이터가 없습니다.');
            return;
        }

        try {
            // 엑셀에 맞는 데이터 형식으로 변환 (View Details 컬럼 제외)
            const excelData = monitoringData.map((item, index) => ({
                'No.': index + 1,
                'Rack ID': item.rackId || '',
                'Rack Type': item.rackType || '',
                'Target Material': item.targetMaterial || '',
                'Short Length': item.flag1 || 'N',
                'Right Material': item.flag2 || 'N',
                'Total Products': item.productCount || 0,
                'Normal': item.normalCount || 0,
                'Abnormal': item.abnormalCount || 0,
                'Last Update': item.lastUpdate || ''
            }));

            // 워크북 생성
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(excelData);

            // 컬럼 너비 설정
            const colWidths = [
                { wch: 5 },   // No.
                { wch: 12 },  // Rack ID
                { wch: 15 },  // Rack Type
                { wch: 20 },  // Target Material
                { wch: 12 },  // Short Length
                { wch: 12 },  // Right Material
                { wch: 15 },  // Total Products
                { wch: 10 },  // Normal
                { wch: 10 },  // Abnormal
                { wch: 20 }   // Last Update
            ];
            ws['!cols'] = colWidths;

            // 워크시트를 워크북에 추가
            XLSX.utils.book_append_sheet(wb, ws, 'Real-time Rack Monitoring');

            // 파일명 생성 (현재 날짜/시간 포함)
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 19).replace(/:/g, '-');
            const fileName = `Rack_Monitoring_${dateStr}.xlsx`;

            // 엑셀 파일 다운로드
            XLSX.writeFile(wb, fileName);
        } catch (error) {
            console.error('Excel download error:', error);
            alert('엑셀 다운로드 중 오류가 발생했습니다.');
        }
    };

    // 상세 모니터링 데이터 엑셀 다운로드 함수
    const downloadDetailedExcel = () => {
        if (!detailedMonitoringData || detailedMonitoringData.length === 0) {
            alert('다운로드할 데이터가 없습니다.');
            return;
        }

        try {
            // 엑셀에 맞는 데이터 형식으로 변환
            const excelData = detailedMonitoringData.map((item, index) => ({
                'No.': index + 1,
                'CDNAME': item.cdname || '',
                'BIN_LOC': item.binLoc || '',
                'BIN_LOCATION_TARGET': item.binLocationTarget || '',
                'REF_MATERIAL_STD_LENGTH': item.refMaterialStdLength || '',
                'MATERIAL_CD': item.materialCd || '',
                'MATERIAL_DESC': item.materialDesc || '',
                'BALANCE_LENGTH': item.balanceLength || '',
                'PROD_GB': item.prodGb || '',
                'LAST_CHG_DT': item.lastChgDt || '',
                'FLAG1': item.flag1 || 'N',
                'FLAG2': item.flag2 || 'N',
                'LEN_RATE': item.lenRate || ''
            }));

            // 워크북 생성
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(excelData);

            // 컬럼 너비 설정
            const colWidths = [
                { wch: 5 },   // No.
                { wch: 12 },  // CDNAME
                { wch: 15 },  // BIN_LOC
                { wch: 20 },  // BIN_LOCATION_TARGET
                { wch: 20 },  // REF_MATERIAL_STD_LENGTH
                { wch: 15 },  // MATERIAL_CD
                { wch: 25 },  // MATERIAL_DESC
                { wch: 15 },  // BALANCE_LENGTH
                { wch: 12 },  // PROD_GB
                { wch: 20 },  // LAST_CHG_DT
                { wch: 8 },   // FLAG1
                { wch: 8 },   // FLAG2
                { wch: 12 }   // LEN_RATE
            ];
            ws['!cols'] = colWidths;

            // 워크시트를 워크북에 추가
            XLSX.utils.book_append_sheet(wb, ws, 'Detailed Rack Monitoring');

            // 파일명 생성 (현재 날짜/시간 포함)
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 19).replace(/:/g, '-');
            const fileName = `Detailed_Rack_Monitoring_${dateStr}.xlsx`;

            // 엑셀 파일 다운로드
            XLSX.writeFile(wb, fileName);
        } catch (error) {
            console.error('Detailed Excel download error:', error);
            alert('엑셀 다운로드 중 오류가 발생했습니다.');
        }
    };

    // Rack ID 컬럼 템플릿 (상세보기 버튼 제거)
    const rackIdBodyTemplate = (rowData) => {
        return (
            <span style={{ fontWeight: 'bold' }}>{rowData.rackId}</span>
        );
    };

    // View Detail 버튼 컬럼 템플릿
    const viewDetailBodyTemplate = (rowData) => {
        return (
            <Button
                icon="pi pi-eye"
                size="small"
                severity="secondary"
                onClick={() => openDetailDialog(rowData.rackId)}
                tooltip="View Details"
                tooltipOptions={{ position: 'top' }}
            />
        );
    };

    return (
        <div className="rack-monitoring-dashboard">
            <div className="dashboard-header">
                <h1>Rack Type Warehouse Monitoring Dashboard</h1>
                <div className="dashboard-controls">
                    <Button 
                        label={isAutoRefresh ? "Stop Auto Refresh" : "Start Auto Refresh"}
                        icon={isAutoRefresh ? "pi pi-stop" : "pi pi-play"}
                        severity={isAutoRefresh ? "danger" : "success"}
                        onClick={toggleAutoRefresh}
                    />
                    <Button 
                        label="Refresh Now" 
                        icon="pi pi-refresh" 
                        onClick={loadDashboardData}
                        loading={loading}
                    />
                </div>
            </div>

            {/* 탭 섹션 */}
            <TabView className="dashboard-tabs">
                {/* 첫 번째 탭: 대시보드 개요 */}
                <TabPanel header="Dashboard Overview">
                     {/* 대시보드 개요 */}
            <div className="dashboard-overview">
                <div className="overview-cards">
                    <Card className="overview-card">
                        <div className="card-content">
                            <div className="card-icon">
                                <i className="pi pi-th-large" style={{ fontSize: '2rem', color: '#2196F3' }}></i>
                            </div>
                            <div className="card-info">
                                <h3>{dashboardData.totalRacks}</h3>
                                <p>Total Racks</p>
                            </div>
                        </div>
                    </Card>

                    <Card className="overview-card">
                        <div className="card-content">
                            <div className="card-icon">
                                <i className="pi pi-check-circle" style={{ fontSize: '2rem', color: '#4CAF50' }}></i>
                            </div>
                            <div className="card-info">
                                <h3>{dashboardData.occupiedRacks}</h3>
                                <p>Occupied Racks</p>
                            </div>
                        </div>
                    </Card>

                    <Card className="overview-card">
                        <div className="card-content">
                            <div className="card-icon">
                                <i className="pi pi-circle" style={{ fontSize: '2rem', color: '#FF9800' }}></i>
                            </div>
                            <div className="card-info">
                                <h3>{dashboardData.availableRacks}</h3>
                                <p>Available Racks</p>
                            </div>
                        </div>
                    </Card>

                    <Card className="overview-card">
                        <div className="card-content">
                            <div className="card-icon">
                                <i className="pi pi-check-circle" style={{ fontSize: '2rem', color: '#4CAF50' }}></i>
                            </div>
                            <div className="card-info">
                                <h3>{dashboardData.activeTags}</h3>
                                <p>Normal Products</p>
                            </div>
                        </div>
                    </Card>

                    <Card className="overview-card">
                        <div className="card-content">
                            <div className="card-icon">
                                <i className="pi pi-exclamation-triangle" style={{ fontSize: '2rem', color: '#F44336' }}></i>
                            </div>
                            <div className="card-info">
                                <h3>{dashboardData.inactiveTags}</h3>
                                <p>Abnormal Products</p>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
                    {/* 차트 섹션 */}
                    <div className="dashboard-charts">
                        <div className="chart-container">
                            <Panel header="Overall Utilization">
                                <Chart type="doughnut" data={chartData.utilization} options={doughnutOptions} style={{ height: '300px' }} />
                            </Panel>
                        </div>
                        <div className="chart-container">
                            <Panel header="Product Status">
                                <Chart type="doughnut" data={chartData.productStatus} options={doughnutOptions} style={{ height: '300px' }} />
                            </Panel>
                        </div>
                        <div className="chart-container">
                            <Panel header="Abnormal Root Causes">
                                <Chart type="bar" data={chartData.abnormal} options={barOptions} style={{ height: '300px' }} />
                            </Panel>
                        </div>
                    </div>

                    {/* Rack Type별 수량 섹션 */}
                    <div className="rack-type-counts">
                        <Panel header="Rack Type Product Summary">
                            {Object.values(dashboardData.rackTypeCounts).some(count => count > 0) ? (
                                <div className="rack-type-grid">
                                    <Card className="rack-type-card">
                                        <div className="rack-type-content">
                                            <div className="rack-type-icon">
                                                <i className="pi pi-th-large" style={{ fontSize: '2rem', color: '#2196F3' }}></i>
                                            </div>
                                            <div className="rack-type-info">
                                                <h3>{dashboardData.rackTypeCounts['7 Rack']}</h3>
                                                <p>7 Rack Products</p>
                                            </div>
                                        </div>
                                    </Card>

                                    <Card className="rack-type-card">
                                        <div className="rack-type-content">
                                            <div className="rack-type-icon">
                                                <i className="pi pi-th-large" style={{ fontSize: '2rem', color: '#4CAF50' }}></i>
                                            </div>
                                            <div className="rack-type-info">
                                                <h3>{dashboardData.rackTypeCounts['5 Rack']}</h3>
                                                <p>5 Rack Products</p>
                                            </div>
                                        </div>
                                    </Card>

                                    <Card className="rack-type-card">
                                        <div className="rack-type-content">
                                            <div className="rack-type-icon">
                                                <i className="pi pi-th-large" style={{ fontSize: '2rem', color: '#FF9800' }}></i>
                                            </div>
                                            <div className="rack-type-info">
                                                <h3>{dashboardData.rackTypeCounts['1 Rack']}</h3>
                                                <p>1 Rack Products</p>
                                            </div>
                                        </div>
                                    </Card>

                                    <Card className="rack-type-card">
                                        <div className="rack-type-content">
                                            <div className="rack-type-icon">
                                                <i className="pi pi-th-large" style={{ fontSize: '2rem', color: '#9C27B0' }}></i>
                                            </div>
                                            <div className="rack-type-info">
                                                <h3>{dashboardData.rackTypeCounts['RW-B']}</h3>
                                                <p>RW-B Products</p>
                                            </div>
                                        </div>
                                    </Card>
                                </div>
                            ) : (
                                <NoDataMessage message="No rack type data available" />
                            )}
                        </Panel>
                    </div>
                </TabPanel>

                {/* 두 번째 탭: 실시간 모니터링 */}
                <TabPanel header="Real-time Rack Monitoring">
                    <div className="real-time-monitoring">
                        <div className="monitoring-header">
                            <Panel header="Real-time Rack Monitoring">
                                {monitoringData.length > 0 ? (
                                    <DataTable 
                                        value={monitoringData} 
                                        showGridlines 
                                        responsiveLayout="scroll"
                                        paginator 
                                        rows={20}
                                        rowsPerPageOptions={[10, 20, 50]}
                                        className="monitoring-table"
                                        scrollable
                                        scrollHeight="600px"
                                    >
                                        <Column field="rackId" header="View Details" body={viewDetailBodyTemplate} style={{ width: '80px', textAlign: 'center' }}></Column>
                                        <Column field="rackId" header="Rack ID" body={rackIdBodyTemplate}></Column>
                                        <Column field="rackType" header="Rack Type"></Column>
                                        <Column field="targetMaterial" header="Target Material"></Column>
                                        <Column field="flag1" header="Short Length" body={(rowData) => (
                                            <Tag value={rowData.flag1 || 'N'} severity={rowData.flag1 === 'Y' ? 'success' : 'danger'} />
                                        )}></Column>
                                        <Column field="flag2" header="Right Material" body={(rowData) => (
                                            <Tag value={rowData.flag2 || 'N'} severity={rowData.flag2 === 'Y' ? 'success' : 'danger'} />
                                        )}></Column>
                                        <Column field="productCount" header="Total Products" style={{ textAlign: 'center' }}></Column>
                                        <Column field="normalCount" header="Normal" style={{ textAlign: 'center' }}></Column>
                                        <Column field="abnormalCount" header="Abnormal" style={{ textAlign: 'center' }}></Column>
                                        <Column field="lastUpdate" header="Last Update"></Column>
                                    </DataTable>
                                ) : (
                                    <NoDataMessage message="No monitoring data available" />
                                )}
                            </Panel>
                            <div className="excel-download-container">
                                <Button
                                    icon="pi pi-download"
                                    label="Download Excel"
                                    onClick={downloadExcel}
                                    severity="success"
                                    size="small"
                                    disabled={monitoringData.length === 0}
                                    tooltip="Download all monitoring data as Excel file"
                                    tooltipOptions={{ position: 'top' }}
                                />
                            </div>
                        </div>
                    </div>
                </TabPanel>

                {/* 세 번째 탭: 상세 모니터링 */}
                <TabPanel header="Detailed Rack Monitoring">
                    <div className="detailed-monitoring">
                        <div className="monitoring-header">
                            <Panel header="Detailed Rack Monitoring">
                                {detailedMonitoringData.length > 0 ? (
                                    <DataTable 
                                        value={detailedMonitoringData} 
                                        showGridlines 
                                        responsiveLayout="scroll"
                                        paginator 
                                        rows={20}
                                        rowsPerPageOptions={[10, 20, 50]}
                                        className="monitoring-table"
                                        scrollable
                                        scrollHeight="600px"
                                    >
                                        <Column field="cdname" header="Rack Type" style={{ textAlign: 'center' }}></Column>
                                        <Column field="binLoc" header="Rack ID" style={{ textAlign: 'center' }}></Column>
                                        <Column field="binLocationTarget" header="Target Material" style={{ textAlign: 'center' }}></Column>
                                        <Column field="refMaterialStdLength" header="STD_LENGTH" style={{ textAlign: 'center' }}></Column>
                                        <Column field="materialCd" header="MATERIAL_CD" style={{ textAlign: 'center' }}></Column>
                                        <Column field="materialDesc" header="MATERIAL_DESC" style={{ textAlign: 'center' }}></Column>
                                        <Column field="balanceLength" header="BALANCE_LENGTH" style={{ textAlign: 'center' }}></Column>
                                        <Column field="prodGb" header="Status" style={{ textAlign: 'center' }}></Column>
                                        <Column field="lastChgDt" header="LAST_CHG_DT" style={{ textAlign: 'center' }}></Column>
                                        <Column field="flag1" header="Short Length" body={(rowData) => (
                                            <Tag value={rowData.flag1 || 'N'} severity={rowData.flag1 === 'Y' ? 'success' : 'danger'} />
                                        )} style={{ textAlign: 'center' }}></Column>
                                        <Column field="flag2" header="Right Material" body={(rowData) => (
                                            <Tag value={rowData.flag2 || 'N'} severity={rowData.flag2 === 'Y' ? 'success' : 'danger'} />
                                        )} style={{ textAlign: 'center' }}></Column>
                                        <Column field="lenRate" header="BL_RATE" style={{ textAlign: 'center' }}></Column>
                                    </DataTable>
                                ) : (
                                    <NoDataMessage message="No detailed monitoring data available" />
                                )}
                            </Panel>
                            <div className="excel-download-container">
                                <Button
                                    icon="pi pi-download"
                                    label="Download Excel"
                                    onClick={downloadDetailedExcel}
                                    severity="success"
                                    size="small"
                                    disabled={detailedMonitoringData.length === 0}
                                    tooltip="Download all detailed monitoring data as Excel file"
                                    tooltipOptions={{ position: 'top' }}
                                />
                            </div>
                        </div>
                    </div>
                </TabPanel>
            </TabView>

            {/* 상세보기 팝업 */}
            <Dialog 
                visible={detailDialogVisible} 
                onHide={closeDetailDialog}
                header={`Rack Details - ${selectedRackDetail?.rackInfo?.rackId || ''}`}
                style={{ width: '80vw', maxWidth: '1200px' }}
                maximizable
                closeIcon="pi pi-times"
            >
                {detailLoading ? (
                    <div style={{ textAlign: 'center', padding: '2rem' }}>
                        <i className="pi pi-spin pi-spinner" style={{ fontSize: '2rem' }}></i>
                        <p>Loading rack details...</p>
                    </div>
                ) : selectedRackDetail ? (
                    <div className="rack-detail-content">
                        <div className="rack-detail-grid">
                            {/* Rack 정보 섹션 */}
                            <div className="rack-info-section">
                                <h3>Rack Information</h3>
                                <div className="info-grid">
                                    <div className="info-item">
                                        <label>Rack ID : </label>
                                        <span>{selectedRackDetail.rackInfo.rackId}</span>
                                    </div>
                                    <div className="info-item">
                                        <label>Status : </label>
                                        <Tag value={selectedRackDetail.rackInfo.status} severity="success" />
                                    </div>
                                    <div className="info-item">
                                        <label>Capacity : </label>
                                        <span>{selectedRackDetail.rackInfo.capacity}</span>
                                    </div>
                                    <div className="info-item">
                                        <label>Occupied : </label>
                                        <span>{selectedRackDetail.rackInfo.occupied}</span>
                                    </div>
                                    <div className="info-item">
                                        <label>Temperature : </label>
                                        <span>{selectedRackDetail.rackInfo.temperature}°C</span>
                                    </div>
                                    <div className="info-item">
                                        <label>Humidity : </label>
                                        <span>{selectedRackDetail.rackInfo.humidity}%</span>
                                    </div>
                                    <div className="info-item">
                                        <label>Last Updated : </label>
                                        <span>{selectedRackDetail.rackInfo.lastUpdated}</span>
                                    </div>
                                </div>
                            </div>

                            {/* 재고 아이템 섹션 */}
                            <div className="inventory-section">
                                <h3>Inventory Items</h3>
                                <DataTable 
                                    value={selectedRackDetail.inventoryItems} 
                                    showGridlines 
                                    responsiveLayout="scroll"
                                    className="inventory-table"
                                >
                                    <Column field="lcCd" header="LC Code" style={{ fontWeight: 'bold' }}></Column>
                                    <Column field="balanceWt" header="Balance Weight" style={{ textAlign: 'center' }}></Column>
                                    <Column field="balanceLength" header="Balance Length" style={{ textAlign: 'center' }}></Column>
                                    <Column field="prodGb" header="Product GB" style={{ textAlign: 'center' }}></Column>
                                    <Column field="prodDt" header="Production Date" style={{ textAlign: 'center' }}></Column>
                                    <Column field="machineDesc" header="Machine Description"></Column>
                                    <Column field="material_cd" header="Material Code" style={{ textAlign: 'center' }}></Column>
                                    <Column field="orgMaterialDesc" header="Material Description"></Column>
                                </DataTable>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '2rem' }}>
                        <p>No rack details available.</p>
                    </div>
                )}
            </Dialog>
        </div>
    );
};

export default RackMonitoringDashboard; 