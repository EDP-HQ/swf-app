"use client";

import React, { useState, useRef, useEffect } from "react";
import { DataTable } from "primereact/datatable";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import domtoimage from 'dom-to-image';
//import * as crypto from 'crypto';
import './my-custom-table.css'; // PrimeReact 스타일

import { esl_d1binsearch_ini, esl_d1binsearch_open, esl_d1binsearch_close, esl_d1Search, pngUpload } from "../../../api/esl"

const EslTagD1 = () => {
    const [YYMM, setYYMM] = useState(null)
    const [sDate, setSDate] = useState(null)
    const [loading, setLoading] = useState(false)
    const dt = useRef(null);
    const dt1 = useRef(null);
    const dt2 = useRef(null);

    const [resultDT1, setResultDT1] = useState([]);
    const [resultDT2, setResultDT2] = useState([]);
    const [selecteddt1, setSelectedDT1] = useState([]);
    const screenInfo = useRef();

    //데이터 테이블 리셋을 위한 key추가
    const [tableKey, setTableKey] = useState(0);

    let sMD5Result = "";
    let sTimeStamp = "";
    let sappkey = "75414638";
    let sappSecret = "c5cfa37e9c904a3cb8af2b21cb489771";
    let smethodName = "";
    let sBin_Location = "";
    let sEsl_Tag = "";
    let sORG_ESL_TAG = "";
    /*// Interval Timer.
    const [count, setCount] = useState(0);

    function useInterval(callback, delay) {
        const savedCallback = useRef();
        useEffect(() => {
            savedCallback.current = callback;
        }, [callback]);

        useEffect(() => {
            function tick() {
                savedCallback.current();
            }
            if(delay !== null) {
                let id = setInterval(tick, delay);
                return() => clearInterval(id);
            }
        }, [delay]);
    }

    useInterval(() => {
        setCount(count => count + 1);
        actionSearchBin_Open();
        handleGetEslTags();
        sampleFunc(count);
    }, 65000);//ms

    const sampleFunc = (count) => {
        console.log(count);
    };
    */
    function useInterval(callback, delay) {
        const savedCallback = useRef();

        // 최신 콜백 저장
        useEffect(() => {
            savedCallback.current = callback;
        }, [callback]);

        // 인터벌 설정 및 해제
        useEffect(() => {
            function tick() {
                savedCallback.current();
            }
            if (delay !== null) {
                let id = setInterval(tick, delay);
                return () => clearInterval(id);
            }
        }, [delay]);
    }

    const [count, setCount] = useState(0);
    const [isRunning, setIsRunning] = useState(false); // 인터벌 실행 여부 상태

    // sampleFunc 정의
    const sampleFunc = (count) => {
        console.log('count:', count);
    };

    // useInterval 사용
    useInterval(async () => {
        setCount((c) => c + 1);
        sampleFunc(count);
        resetDataTable();
        await actionSearchBin_Open();
        await handleGetEslTags();
    }, isRunning ? 65000 : null); // isRunning이 true면 65초마다 실행, 아니면 멈춤

    // 버튼 핸들러
    const handleStart = () => setIsRunning(true);
    const handleStop = () => setIsRunning(false);

    const handleLoad = () => {
        console.log('ESL TAG D1 RACK Generation Service');
    }

    const handleKeyPress = (e) => {
        // console.log('handleKeyPress', e);
        if (e.key === 'Enter') {
            actionSearchMD5();
        }
    }
    //
    const actionSearchBin_Reset = () => {
        resetDataTable();
        const today = new Date();
        let myDate = today.getFullYear();
        console.log('actionSearchBin_Reset', '');
        SearchUpdateList_Reset();

    }

    const actionSearchBin_Open = async () => {
        resetDataTable();
        const today = new Date();
        let myDate = today.getFullYear();
        console.log('actionSearchBin_Open', '');
        SearchUpdateList_Open();
        await new Promise(resolve => setTimeout(resolve, 1000));//인터벌에서 순차적 처리를 위해 await/Promise 사용
    }

    const actionSearchD1 = (iBin_Location) => {
        const today = new Date();
        let myDate = today.getFullYear();
        console.log('actionSearch > myDate', myDate)
        SearchD1Data(myDate, iBin_Location)
    }

    const resetDataTable = () => {
        console.log('Initialization in progress..');
        setResultDT1([]); // 데이터 초기화
        setSelectedDT1([]); // 선택 초기화
        setResultDT2([]); // 데이터 초기화
        setTableKey(prevKey => prevKey + 1);  // key를 업데이트하여 DataTable을 강제로 리마운트
    };

    //MD5 Hash Encrypit 
    const actionMD5Hash = (appkey, appSecret, TimeStamp, methodName) => {
        const signstring = appkey + appSecret + TimeStamp + methodName;
        sMD5Result = crypto.createHash('md5').update(signstring).digest("hex");
        sMD5Result = sMD5Result.toUpperCase();
    }
    //Make a TimeStamp 13 digits
    const actionTimeStamp = () => {
        sTimeStamp = (new Date()).toISOString().replace(/[^0-9]/g, '').slice(0, -4);
        console.log(sTimeStamp);

    }
    //Send the data to ESL Tag.
    const actionSendData = (sEsl_Tag) => {
        smethodName = "bindingPos";
        actionTimeStamp();
        actionMD5Hash(sappkey, sappSecret, sTimeStamp, smethodName);
        console.log('Esl_Tag', sEsl_Tag);

        fetch("http://194.1.31.11:8080/api/handle", {
            method: "post",
            headers: {
                "Content-Type": "application/json",
            },
            // API: bindingPos
            body: JSON.stringify({
                "appKey": sappkey,
                "sign": sMD5Result,
                "timestamp": sTimeStamp,
                "methodName": smethodName,
                "lang": "en-US",
                "data": {
                    "stationId": "A0A3B812CA90",
                    "templateId": 7,
                    "deviceNumber": sEsl_Tag,
                    "uniqueIdList": [sEsl_Tag]
                }
            }),

        })
            .then((res) => res.json())
            .then((res) => {
                console.log(res);
            });
    }

    //update Product.
    //D1 : only png.  others : 
    const actionUpdateProduct = (sEsl_Tag, sORG_ESL_TAG, sBin_Location) => {
        smethodName = "updateProduct";
        const picUrlList = "http://194.1.31.11:8089/upload/" + sEsl_Tag + ".png";
        actionTimeStamp();
        actionMD5Hash(sappkey, sappSecret, sTimeStamp, smethodName);
        console.log('MethodName', smethodName + '/' + sEsl_Tag + '/' + sORG_ESL_TAG + '/' + picUrlList);
        console.log('text', sappkey + '/' + sappSecret + '/' + sTimeStamp + '/' + smethodName + '/' + sMD5Result);
        return fetch("http://194.1.31.11:8080/api/handle", {
            method: "post",
            headers: {
                "Content-Type": "application/json",
            },
            // API: updateProduct
            body: JSON.stringify({
                "appKey": sappkey,
                "lang": "en_US",
                "methodName": smethodName,
                "sign": sMD5Result,
                "timestamp": sTimeStamp,
                "data": {
                    "uniqueId": sORG_ESL_TAG,
                    "prodName": sBin_Location,
                    "detailUrl": "",
                    "priceUnit": "",
                    "commodityUnit": "",
                    "price": 0,
                    "copyWriting": "SWR Factory",
                    "picUrlList": [
                        picUrlList
                    ],
                    "custFeature1": "010101",
                    "custFeature2": "",
                    "custFeature3": "",
                    "custFeature4": "",
                    "custFeature5": "",
                    "custFeature6": "",
                    "custFeature7": "",
                    "custFeature8": "",
                    "custFeature9": "",
                    "custFeature10": "",
                    "custFeature11": "",
                    "custFeature12": "",
                    "custFeature13": "",
                    "custFeature14": "",
                    "custFeature15": "",
                    "custFeature16": "",
                    "custFeature17": "",
                    "custFeature18": "",
                    "custFeature19": "",
                    "custFeature20": "",
                    "custFeature21": "",
                    "custFeature22": "",
                    "custFeature23": "",
                    "custFeature24": "",
                    "custFeature25": "",
                    "custFeature26": "",
                    "custFeature27": "",
                    "custFeature28": "",
                    "custFeature29": "",
                    "custFeature30": "",
                    "custFeature31": "",
                    "custFeature32": "",
                    "custFeature33": "",
                    "custFeature34": "",
                    "custFeature35": "",
                    "custFeature36": "",
                    "custFeature37": "",
                    "custFeature38": "",
                    "custFeature39": "",
                    "custFeature40": "",
                    "custFeature41": "",
                    "custFeature42": "",
                    "custFeature43": "",
                    "custFeature44": "",
                    "custFeature45": "",
                    "custFeature46": "",
                    "custFeature47": "",
                    "custFeature48": "",
                    "custFeature49": "",
                    "custFeature50": ""
                }
            }),

        })
            .then((res) => {
                // HTTP 응답 상태 확인 (중요)
                if (!res.ok) {
                    // 오류 응답 처리
                    return res.json().then(errorData => {
                        console.error("API Error Response:", errorData);
                        const error = new Error(errorData.msg || `HTTP error! status: ${res.status}`);
                        error.status = res.status; // HTTP 상태 코드를 에러 객체에 추가
                        error.data = errorData;    // 파싱된 에러 데이터를 에러 객체에 추가
                        throw error; // 에러를 throw하여 호출 측의 catch 블록에서 처리하도록 함
                    }).catch(jsonParseError => {
                        // JSON 파싱 자체에 실패한 경우 (예: 서버가 HTML 에러 페이지 반환)
                        console.error("API Error (not JSON):", res.status, res.statusText);
                        const error = new Error(`HTTP error! status: ${res.status} - ${res.statusText}`);
                        error.status = res.status;
                        throw error;
                    });
                }
                return res.json(); // 성공 시 JSON 파싱 Promise 반환
            })
            .then((parsedJsonData) => {
                // 두 번째 .then(): 파싱된 JSON 데이터를 받음
                console.log("Successfully received and parsed JSON:", parsedJsonData);
                return parsedJsonData; // 파싱된 JSON 객체를 최종적으로 반환
            })
            .catch((error) => {
                // 네트워크 오류 또는 위에서 throw된 에러 처리
                console.error("Error in actionUpdateProduct fetch chain:", error.message);
                // 호출 측에서 일관된 에러 처리를 위해 에러 객체 또는 약속된 형태의 객체 반환
                // (이 예제에서는 에러를 다시 throw하여 호출 측의 try/catch에서 잡도록 함)
                // 또는, 특정 형태의 객체를 반환할 수도 있습니다:
                // return {
                //     status: error.status || 500, // 에러 객체에 status가 있다면 사용
                //     msg: error.message || "An error occurred during the API call.",
                //     data: error.data || null // 에러 객체에 data가 있다면 사용
                // };
                throw error; // 에러를 다시 throw 하는 것이 일반적
            });
    }

    //Screen Shot & Save ( dom to Image & file-saver )
    //const onDownloadBtn = () => {
    //    const card = screenInfo.current;
    //    console.log("캡처할 요소:", card); // null 또는 undefined인지 확인
    //    domtoimage.toBlob(card).then(blob => {
    //      saveAs(blob, 'card.png');
    //    })
    //}

    //Screen Shot & Save ( dom to Image & multer )
    const actionScreenshot = (sEsl_Tag) => {
        //screen dom specify
        const card = screenInfo.current;

        if (!card) {
            console.error("Error: Could not find element to capture.");
            // Display an error message to the user (e.g., using an alert or updating the UI)
            alert("Error capturing element. Please try again.");
            return; // Stop execution if card is null or undefined
        }

        domtoimage.toBlob(card).then(async blob => {
            style: {
                margin: '0';
                padding: '0';
                overflow: 'visible' // 숨겨진 콘텐츠가 있다면 보이도록 설정
            }
            try {
                const png_result = await pngUpload(blob, sEsl_Tag + '.png');
                if (png_result.success) {
                    // Success!  Do something, e.g., display a success message.
                    console.log("Image uploaded successfully!");
                } else {
                    // Handle error from pngUpload
                    console.error("Error uploading image:", png_result.error || png_result.message);
                    alert("Error uploading image. Please try again.");
                }
            } catch (error) {
                // Handle any other errors during the upload process
                console.error("An unexpected error occurred:", error);
                alert("An unexpected error occurred. Please try again.");
            }
        }).catch(error => {
            // Handle errors from domtoimage.toBlob
            console.error("Error converting DOM to blob:", error);
            alert("Error capturing image. Please try again.");
        });
    };

    const handleGetEslTags = async () => {
        const today = new Date();
        let myDate = today.getFullYear();
        const hasSelected = selecteddt1.length > 0;

        if (hasSelected) {
            for (const row of selecteddt1) {
                const { STORE_COL, ORG_BIN_LOCATION_CD, BIN_LOCATION_CD, ESL_TAG, ORG_ESL_TAG, O } = row;
                try {
                    //D1 RACK Detail Search
                    const result1 = await SearchD1Data(myDate, STORE_COL);
                    await new Promise(resolve => setTimeout(resolve, 1000)); //Delay
                    //Screenshot
                    const result2 = await actionScreenshot(ESL_TAG);
                    await new Promise(resolve => setTimeout(resolve, 1000)); //Delay
                    //UpdateProduct to Middleware
                    const result3 = await actionUpdateProduct(ESL_TAG, ORG_ESL_TAG, BIN_LOCATION_CD);
                    await new Promise(resolve => setTimeout(resolve, 1000)); //Delay;
                    //const result4 = await actionSendData(ESL_TAG);
                    //console.log('result: ', result1);
                    const statusValue = result3.status; // 200;success
                    if (statusValue == 200) {
                        //전송 성공 후 OPEN - CLOSE 변경 필요.
                        const opentoclose = await SearchUpdateList_Close(ORG_BIN_LOCATION_CD, ORG_ESL_TAG);
                        //console.log('opentoclose: ', opentoclose);
                    }
                    //Binding   -- update 만 해도 자동 Binding 이 되더라.
                    //const result4 = await actionSendData(ORG_ESL_TAG);
                    await new Promise(resolve => setTimeout(resolve, 1000)); //Delay;

                } catch (e) {
                    console.error("error: ", e);
                }
            }
        } else {
            console.log('hasSelected: ', 'no selected items.');
        }
    };

    const SearchUpdateList_Reset = async () => {
        try {
            setLoading(true);
            console.log('SearchUpdateList_Reset > _param:', '')
            const _params = {
            };

            const _result = await esl_d1binsearch_ini(_params);
            console.log('handleFetchData > _result', _result.data)
            setResultDT1(_result.data);

        } catch (error) {
            //toast.current.show({ severity: 'error', summary: 'Warning', detail: error.message || 'An unexpected error occurred', life: 3000 });
            setResultDT1([]);
        } finally {
            setLoading(false);
        }
    };

    const SearchUpdateList_Open = async () => {
        try {
            setLoading(true);
            console.log('SearchUpdateList_Open > _param:', '')
            const _params = {
            };

            const _result = await esl_d1binsearch_open(_params);
            console.log('SearchUpdateList_Open > _result', _result.data)
            setResultDT1(_result.data);

            //Auto Selected
            if (_result.data && _result.data.length > 0) {
                console.log('ALL DATA Selected..');
                setSelectedDT1([..._result.data]);
            } else {
                setSelectedDT1([]);
            }

        } catch (error) {
            //toast.current.show({ severity: 'error', summary: 'Warning', detail: error.message || 'An unexpected error occurred', life: 3000 });
            setResultDT1([]);
        } finally {
            setLoading(false);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    };

    //DT Search and Fetch
    const SearchD1Data = async (isYYMM, iBin_Location) => {
        try {
            setLoading(true);
            console.log('SearchD1Data > _param:', isYYMM, iBin_Location)
            const _params = {
                "SDATE": isYYMM,
                "SBIN_LOCATION": iBin_Location
            };

            const _result = await esl_d1Search(_params);
            console.log('handleFetchData > _result', _result.data)
            setResultDT2(_result.data);

        } catch (error) {
            toast.current.show({ severity: 'error', summary: 'Warning', detail: error.message || 'An unexpected error occurred', life: 3000 });
            setResultDT2([]);
        } finally {
            setLoading(false);
        }
    };
    //OPEN to CLOSE
    const SearchUpdateList_Close = async (iBin_Location, sEsl_Tag) => {
        try {
            setLoading(true);
            console.log('SearchUpdateList_Close > _param:', iBin_Location, sEsl_Tag)
            const _params = {
                "SBIN_LOCATION": iBin_Location,
                "SESL_TAG_ID": sEsl_Tag
            };

            const _result = await esl_d1binsearch_close(_params);
            console.log('handleFetchData > _result', _result.data)
        } catch (error) {
            //toast.current.show({ severity: 'error', summary: 'Warning', detail: error.message || 'An unexpected error occurred', life: 3000 });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        handleLoad();
        /*
            // 데이터(resultDT1)가 로드되거나 변경될 때 실행
            if (resultDT1 && resultDT1.length > 0) {
                // 전체 데이터 배열 자체를 선택된 항목으로 설정
                // PrimeReact는 기본적으로 선택된 행 객체의 배열을 사용합니다.
                setSelectedDT1([...resultDT1]); // 초기 선택 상태를 모든 제품으로 설정 (얕은 복사 권장)
            } else {
                setSelectedDT1([]); // 데이터가 없으면 선택 해제
            }
        }, [resultDT1]); // resultDT1 배열이 변경될 때마다 이 effect를 다시 실행 */
    });

    return (
        <div className="grid">
            <div className="ESL_TAG">
                {/* ################### UI FOR SEARCH FROM ################## */}
                <div className="card">
                    <h5>ESL TAG Information</h5>
                    <div className="field" style={{ textAlign: 'right' }}>
                        <Button label="Search_Reset" icon="pi pi-search" outlined onClick={() => { actionSearchBin_Reset() }} />
                        <Button label="Search_Open" icon="pi pi-search" outlined onClick={() => { actionSearchBin_Open() }} />
                        <Button label="Auto Mornitoring" icon="pi pi-heart" outlined onClick={() => { handleGetEslTags() }} />
                        <Button label="Auto Start" icon="pi pi-play" outlined onClick={() => { handleStart() }} />
                        <Button label="Auto Stop" icon="pi pi-stop" outlined onClick={() => { handleStop() }} />
                        <Button label="ScreenShot" icon="pi pi-heart" outlined onClick={() => { actionScreenshot(sEsl_Tag) }} />
                        <Button label="Procudt" icon="pi pi-heart" outlined onClick={() => { actionUpdateProduct(sEsl_Tag) }} />
                        <Button label="Binding" icon="pi pi-heart" outlined onClick={() => { actionSendData(sEsl_Tag) }} />
                    </div>

                    <DataTable showGridlines tableStyle={{ minWidth: '50rem' }}
                        ref={dt1}
                        value={resultDT1}
                        selection={selecteddt1}
                        onSelectionChange={(e) => setSelectedDT1(e.value)}
                    >
                        <Column selectionMode="multiple" exportable={false} headerStyle={{ width: '3rem' }}></Column>
                        <Column field="STORE_COL" header="STORE_COL"></Column>
                        <Column field="ORG_BIN_LOCATION_CD" header="ORG_BIN"></Column>
                        <Column field="BIN_LOCATION_CD" header="BIN_LOCATION"></Column>
                        <Column field="ESL_TAG" header="ESL TAG"></Column>
                        <Column field="ORG_ESL_TAG" header="ORG_ESL TAG"></Column>
                        {/* <Column field="" header="" style={{ width: '0px' }}></Column > */}
                    </DataTable>
                </div>
                <div ref={screenInfo} className="data-tables-container">
                    <div className="data-table-wrapper">
                        <div className="my-custom-table-title">
                            <h1>1st Floor</h1>
                        </div>
                        <DataTable className="my-custom-table" showGridlines
                            ref={dt2}
                            value={resultDT2}
                        >
                            {/* 첫 번째 DataTable */}
                            {/*<Column field="BIN_LOCATION_CD_1" header="Bin Location" body={(rowData) => <span style={{fontSize:'18px', fontWeight: 'bold' }}>{rowData.BIN_LOCATION_CD_1}</span>}></Column>
                            */}
                            <Column field="BIN_LOCATION_CD_2" header="DS0003" style={{ textAlign: 'center', fontWeight: 'bold', width: '70px' }} ></Column>
                            <Column field="LC_CD_2" header="Bobin" style={{ textAlign: 'center', fontWeight: 'bold', width: '70px' }}></Column>
                            <Column field="GAL_TP_2" header="U/G" style={{ textAlign: 'center', fontWeight: 'bold', width: '40px' }}></Column>
                            <Column field="DIA_2" header="Dia" style={{ textAlign: 'center', fontWeight: 'bold', width: '40px' }}></Column>
                            <Column field="MATERIAL_GRADE_2" header="Grade" style={{ textAlign: 'center', fontWeight: 'bold', width: '40px' }}></Column>
                            <Column field="BALANCE_LENGTH_2" header="  Length" style={{ textAlign: 'center', fontWeight: 'bold', width: '95px' }}></Column>
                            {/* <Column field="" header="" style={{ width: '0px' }}></Column > */}
                        </DataTable>
                    </div>

                    <div className="data-table-wrapper">
                        <div className="my-custom-table-title">
                            <h1>2nd Floor</h1>
                        </div>
                        <DataTable className="my-custom-table" showGridlines
                            ref={dt2}
                            value={resultDT2}
                        >
                            {/* 두 번째 DataTable */}
                            {/* <Column field="" header="" style={{ width: '0px' }}></Column > */}
                            <Column field="BIN_LOCATION_CD_1" header="DS0003" style={{ textAlign: 'center', fontWeight: 'bold', width: '70px' }}></Column>
                            <Column field="LC_CD_1" header="Bobin" style={{ textAlign: 'center', fontWeight: 'bold', width: '70px' }}></Column>
                            <Column field="GAL_TP_1" header="U/G" style={{ textAlign: 'center', fontWeight: 'bold', width: '40px' }}></Column>
                            <Column field="DIA_1" header="Dia" style={{ textAlign: 'center', fontWeight: 'bold', width: '40px' }}></Column>
                            <Column field="MATERIAL_GRADE_1" header="Grade" style={{ textAlign: 'center', fontWeight: 'bold', width: '40px' }}></Column>
                            <Column field="BALANCE_LENGTH_1" header="Length" style={{ textAlign: 'center', fontWeight: 'bold', width: '95px' }}></Column>
                        </DataTable>
                    </div>
                </div>
            </div>
        </div>
    );
};
export default EslTagD1;