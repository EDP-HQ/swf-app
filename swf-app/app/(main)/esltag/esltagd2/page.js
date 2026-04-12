"use client";

import React, { useState, useRef, useEffect } from "react";
import { DataTable } from "primereact/datatable";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
//import domtoimage from 'dom-to-image';
import CryptoJS from 'crypto-js';
import { esl_opensearch, esl_inventorySearch, esl_d1binsearch_close } from "../../../api/esl"

const EslTagOpen = () => {
    const [YYMM, setYYMM] = useState(null)
    const [sDate, setSDate] = useState(null)
    const [loading, setLoading] = useState(false)
    const dt = useRef(null);
    const dt1 = useRef(null);
    const dt2 = useRef(null);

    const [resultDT1, setResultDT1] = useState([]);
    const [resultDT2, setResultDT2] = useState([]);
    const [selecteddt1, setSelectedDT1] = useState([]);
    const [selectedBinValues, setSelectedBinValues] = useState([]);
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
    let picUrlList = "";

    // Interval Timer.
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
        resetDataTable();
        sampleFunc(count);
        //비동기 함수들이 await 를 사용해 Promise를 반환하도록 해야 순차적으로 실행됨.
        await handleGetEslTags();
    }, isRunning ? 65000 : null); // isRunning이 true면 65초마다 실행, 아니면 멈춤

    // 버튼 핸들러
    const handleStart = () => setIsRunning(true);
    const handleStop = () => setIsRunning(false);

    const handleLoad = () => {
        console.log('ESL TAG OPEN RACK Generation Service');
    }

    const handleKeyPress = (e) => {
        // console.log('handleKeyPress', e);
        if (e.key === 'Enter') {
            console.log('Enter key pressed');
        }
    }
    //
    const actionSearchBin_Open = async () => {
        resetDataTable();
        const today = new Date();
        let myDate = today.getFullYear();
        console.log('actionSearchBin_Open', '')
        await SearchUpdateList_Open(); // Added await here
        await new Promise(resolve => setTimeout(resolve, 1000));//인터벌에서 순차적 처리를 위해 await/Promise 사용
    }

    const resetDataTable = () => {
        console.log('Initialization in progress..');
        setResultDT1([]); // 데이터 초기화
        setResultDT2([]); // 데이터 초기화
        setSelectedDT1([]); // 선택 초기화
        setTableKey(prevKey => prevKey + 1);  // key를 업데이트하여 DataTable을 강제로 리마운트
    };

    ///MD5 Hash Encrypit 
    const actionMD5Hash = (appkey, appSecret, TimeStamp, methodName) => {
        const signstring = appkey + appSecret + TimeStamp + methodName;
        sMD5Result = CryptoJS.MD5(signstring).toString();
        sMD5Result = sMD5Result.toUpperCase();
    }
    //Make a TimeStamp 13 digits
    const actionTimeStamp = () => {
        sTimeStamp = (new Date()).toISOString().replace(/[^0-9]/g, '').slice(0, -4);
        console.log(sTimeStamp);

    }
    //Send the data to ESL Tag.
    const actionSendData = async (sEsl_Tag) => {
        if (!sEsl_Tag) {
            console.error('ESL Tag ID is required for binding');
            return Promise.reject(new Error('ESL Tag ID is required'));
        }
        
        smethodName = "bindingPos";
        actionTimeStamp();
        actionMD5Hash(sappkey, sappSecret, sTimeStamp, smethodName);
        console.log('Esl_Tag', sEsl_Tag);

        return fetch("http://194.1.31.11:8080/api/handle", {
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
            .then((res) => {
                if (!res.ok) {
                    throw new Error(`HTTP error! status: ${res.status}`);
                }
                return res.json();
            })
            .then((res) => {
                console.log(res);
                return res;
            })
            .catch((error) => {
                console.error("Error in actionSendData:", error);
                throw error;
            });
    }

    //update Product.
    const actionUpdateProduct = async (sEsl_Tag, sBin_Location, custFeatures) => {
        if (!sEsl_Tag || !sBin_Location || !custFeatures) {
            console.error('Missing required parameters for actionUpdateProduct');
            return Promise.reject(new Error('Missing required parameters'));
        }

        smethodName = "updateProduct";
        actionTimeStamp();
        actionMD5Hash(sappkey, sappSecret, sTimeStamp, smethodName);
        console.log('MethodName', smethodName + '/' + sEsl_Tag);
        console.log('text', sappkey +'/' + sappSecret+'/' + sTimeStamp+'/' + smethodName +'/' + sMD5Result);

        //http://194.1.31.11:8080/iknow/imgs/upload/product/953/2025/6/11/RedColor.png
        //http://194.1.31.11:8080/iknow/imgs/upload/product/953/2025/6/11/blackColor.png
        //http://194.1.31.11:8080/iknow/imgs/upload/product/953/2025/6/11/WhiteColor.png
        
        if(custFeatures.custFeature50 == "Mixed"){
            picUrlList = "http://194.1.31.11:8089/upload/Red.png";
        }else{
            picUrlList ="http://194.1.31.11:8089/upload/Black.png";
        }

        // 1. API가 요구하는 기본 data 객체 구조를 만든다.
        const baseData = {
            "uniqueId": sEsl_Tag,
            "prodName": sBin_Location,
            "detailUrl": "",
            "priceUnit": "",
            "commodityUnit": "",
            "price": 0,
            "copyWriting": "SWR Factory",
            "picUrlList": [
                        picUrlList
                    ],
        };
        //console.log('baseData', baseData);
        //console.log('custFeatures', custFeatures);
        // 2. 전개 구문(...)을 사용하여 baseData와 custFeatures 객체를 합침
        const finalData = { ...baseData, ...custFeatures };
        console.log('finalData', finalData);
        return fetch("http://194.1.31.11:8080/api/handle", {
            method: "post",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                "appKey": sappkey,
                "lang": "en_US",
                "methodName": smethodName,
                "sign": sMD5Result,
                "timestamp": sTimeStamp,
                // 3. 합쳐진 최종 데이터를 body의 data 필드로
                "data": finalData
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
    };
    /*
            fetch("http://194.1.31.11:8080/api/handle", {
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
                        "uniqueId": sEsl_Tag,
                        "prodName": sBin_Location,
                        "detailUrl": "",
                        "priceUnit": "",
                        "commodityUnit": "",
                        "price": 0,
                        "copyWriting": "SWR Factory",
                        "picUrlList": [ 
                            ""
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
                .then((res) => res.json())
                .then((res) => {
                console.log(res);
                });
        }*/

    const handleGetEslTags = async () => {
        const today = new Date();
        let myDate = today.getFullYear();
        await actionSearchBin_Open(); // 각 함수는 async로 선언되어야 비동기함수로 동작.
        await new Promise(resolve => setTimeout(resolve, 1000)); //Delay
        const hasSelected = selecteddt1.length > 0;

        if (hasSelected) {
            for (const row of selecteddt1) {
                const { STORE_COL, BIN_LOCATION_CD, ESL_TAG_ID, COMPANY, FACTORY } = row;
                try {
                    //Detail Search
                    const result1 = await SearchDataBin(BIN_LOCATION_CD, COMPANY, FACTORY);
                    await new Promise(resolve => setTimeout(resolve, 1000)); //Delay
                    setResultDT2(result1); // 조회 후 못가져오는 경우가 있음.
                    //Object generation - ESL MiddleWare 로 보내기 위함
                    let result2="";
                    if(BIN_LOCATION_CD.substring(0,1) == 'R'){
                        result2 = await DataBinObject_RW(result1);
                    await new Promise(resolve => setTimeout(resolve, 1000)); //Delay
                    }else{
                        result2 = await DataBinObject(result1);
                        await new Promise(resolve => setTimeout(resolve, 1000)); //Delay
                    }
                    console.log('result: ', result2);
                    await new Promise(resolve => setTimeout(resolve, 1000)); //Delay
                    ////UpdateProduct to Middleware
                    const result3 = await actionUpdateProduct(ESL_TAG_ID, BIN_LOCATION_CD, result2);
                    await new Promise(resolve => setTimeout(resolve, 1000)); //Delay;
                    const statusValue = result3.status; // 200;success
                    if (statusValue == 200) {
                        //전송 성공 후 OPEN - CLOSE 변경 필요.
                        const opentoclose = await SearchUpdateList_Close(BIN_LOCATION_CD, ESL_TAG_ID);
                        console.log('opentoclose: ', opentoclose);
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

    const SearchUpdateList_Open = async () => {
        try {
            setLoading(true);
            console.log('SearchUpdateList_Open > _param:', '')
            const _params = {
            };

            const _result = await esl_opensearch(_params);
            console.log('handleFetchData > _result', _result.data)
            setResultDT1(_result.data);

            //Auto Selected
            if (_result.data && _result.data.length > 0) {
                setSelectedDT1([..._result.data]);
                console.log('ALL DATA Selected..', _result.data);
            } else {
                setSelectedDT1([]);
            }
        } catch (error) {
            console.error('Error in SearchUpdateList_Open:', error);
            //toast.current.show({ severity: 'error', summary: 'Warning', detail: error.message || 'An unexpected error occurred', life: 3000 });
            setResultDT1([]);
        } finally {
            setLoading(false);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    };

    const getSelectedBinLocation = () => {
        return selecteddt1.map(row => ({
            BIN_LOCATION_CD: row.BIN_LOCATION_CD,
            COMPANY: row.COMPANY,
            FACTORY: row.FACTORY
        }));
    };
    //custFeature 처리
    const DataBinObject = async (data) => {
        if (!data || data.length === 0) {
            console.warn("DataBinObject: [null]");
            return {}; // 빈 객체 반환
        }
        // 1. 추출할 필드 순서 정의
        const fieldsToExtract = [
            'LC_CD',
            'MATERIAL_DESC',
            'LENGTH'

        ];
        // 2. 결과를 담을 빈 객체와 키 카운터 초기화
        const flattenedObject = {};
        for (let i = 1; i <= 50; i++) {   //50개 
            const dynamicKey = `custFeature${i}`;
            flattenedObject[dynamicKey] = '';
        }
        let keyCounter = 1; // 키는 1부터 시작

        // 3. resultDT2 배열의 각 행을 순회
        data.forEach(row => {
            // 4. 각 행에서 정의된 필드들을 순서대로 순회
            fieldsToExtract.forEach(fieldName => {
                if (keyCounter <= 50) {
                // 'custFeature' + 숫자로 동적 키 생성
                const dynamicKey = `custFeature${keyCounter}`;
                // 5. 현재 키 카운터를 키로 사용하여 flattenedObject에 값 할당
                // 값이 null이나 undefined일 경우 빈 문자열('')로 처리
                flattenedObject[dynamicKey] = row[fieldName] ?? '';
                // 6. 다음 키를 위해 카운터 증가
                keyCounter++;
                }
            });
        });
        //전체개수, MAX_DIA, MIN_DIA 전달  DRAWN WIRE STORE 2 161
        if (data[0] && data[0].BIN_LOCATION_DESC && data[0].BIN_LOCATION_DESC.substring(0,18) =="DRAWN WIRE STORE 2"){
            flattenedObject.custFeature44 = "DRAWING 5-RACK"
            flattenedObject.custFeature45 = data[0].BIN_LOCATION_DESC.slice(-4);
        }else if(data[0] && data[0].BIN_LOCATION_DESC && data[0].BIN_LOCATION_DESC.substring(0,18) =="DRAWN WIRE STORE 1"){
            flattenedObject.custFeature44 = "DRAWING 7-RACK"
            flattenedObject.custFeature45 = data[0].BIN_LOCATION_DESC.slice(-4);
        }else{
            flattenedObject.custFeature45 = data[0]?.BIN_LOCATION_DESC || '';
        };

        //flattenedObject.custFeature45 = data[0].BIN_LOCATION_DESC;
        flattenedObject.custFeature46 = data[0]?.BIN_LOCATION_BARCODE_ID || '';
        flattenedObject.custFeature47 = (data[0]?.MIN_DIA || '') + 'MM-' + (data[0]?.MAX_DIA || '') + 'MM'
        flattenedObject.custFeature48 = data[0]?.MAX_DIA || '';
        flattenedObject.custFeature49 = data[0]?.T_COUNT || '';
        flattenedObject.custFeature50 = data[0]?.MIX_TYPE || '';

        // 결과 확인
        console.log(flattenedObject);
        return flattenedObject;
    };

    //RW-BUFFER 를 따로 만들어야 함.
    const DataBinObject_RW = async (data) => {
        if (!data || data.length === 0) {
            console.warn("DataBinObject_RW: [null]");
            return {}; // 빈 객체 반환
        }
        // 1. 추출할 필드 순서 정의
        const fieldsToExtract = [
            'LC_CD',
            'MATERIAL_DESC',
            'LENGTH'

        ];
        // 2. 결과를 담을 빈 객체와 키 카운터 초기화
        const flattenedObject = {};
        for (let i = 1; i <= 50; i++) {   //50개 
            const dynamicKey = `custFeature${i}`;
            flattenedObject[dynamicKey] = '';
        }
        let keyCounter = 1; // 키는 1부터 시작

        // 3. resultDT2 배열의 각 행을 순회
        data.forEach(row => {
            // 4. 각 행에서 정의된 필드들을 순서대로 순회
            fieldsToExtract.forEach(fieldName => {
                if (keyCounter <= 50) {
                // 'custFeature' + 숫자로 동적 키 생성
                const dynamicKey = `custFeature${keyCounter}`;
                // 5. 현재 키 카운터를 키로 사용하여 flattenedObject에 값 할당
                // 값이 null이나 undefined일 경우 빈 문자열('')로 처리
                flattenedObject[dynamicKey] = row[fieldName] ?? '';
                // 6. 다음 키를 위해 카운터 증가
                keyCounter++;
                }
            });
        });
        //전체개수, MAX_DIA, MIN_DIA 전달
        flattenedObject.custFeature45 = data[0]?.BIN_LOCATION_DESC || '';
        flattenedObject.custFeature46 = data[0]?.BIN_LOCATION_BARCODE_ID || '';
        flattenedObject.custFeature47 = 'DIAMETER:' + (data[0]?.MIN_DIA || '') + 'MM ~ ' + (data[0]?.MAX_DIA || '') + 'MM'
        flattenedObject.custFeature48 = data[0]?.MAX_DIA || '';
        flattenedObject.custFeature49 = data[0]?.T_COUNT || '';
        flattenedObject.custFeature50 = data[0]?.MIX_TYPE || '';

        // 결과 확인
        console.log(flattenedObject);
        return flattenedObject;
    };

    //DT Search and Fetch
    const SearchDataBin = async (iBin_Location,iCompany,iFactory) => {
        if (!iBin_Location) {
            console.error('Bin location is required for search');
            return [];
        }
        
        try {
            setLoading(true);
            //const binValues = selecteddt1.map(row => row.BIN_LOCATION_CD);
            //console.log(binValues[0]);
            //const binValue = binValues[0];

            console.log('Selected BIN_LOCATION_CD values:', iBin_Location, iCompany, iFactory)
            const _params = {
                "SBIN_LOCATION": iBin_Location,
                ...(iCompany && { "SCOMPANY": iCompany }),
                ...(iFactory && { "SFACTORY": iFactory })
            };
            const _result = await esl_inventorySearch(_params);
            console.log('handleFetchData > _result', _result.data)
            setResultDT2(_result.data);
            return _result.data;

        } catch (error) {
            console.error('Error fetching data:', error);
            //toast.current.show({ severity: 'error', summary: 'Warning', detail: error.message || 'An unexpected error occurred', life: 3000 });
            setResultDT2([]);
            return [];
        } finally {
            setLoading(false);
        }
    };

    //OPEN to CLOSE
    const SearchUpdateList_Close = async (iBin_Location, sEsl_Tag) => {
        if (!iBin_Location || !sEsl_Tag) {
            console.error('Bin location and ESL tag are required for close operation');
            return null;
        }
        
        try {
            setLoading(true);
            console.log('SearchUpdateList_Close > _param:', iBin_Location, sEsl_Tag)
            const _params = {
                "SBIN_LOCATION": iBin_Location,
                "SESL_TAG_ID": sEsl_Tag
            };

            const _result = await esl_d1binsearch_close(_params);
            console.log('handleFetchData > _result', _result.data)
            return _result.data;
        } catch (error) {
            console.error('Error in SearchUpdateList_Close:', error);
            //toast.current.show({ severity: 'error', summary: 'Warning', detail: error.message || 'An unexpected error occurred', life: 3000 });
            return null;
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        handleLoad();
    }, [])

    return (
        <div className="grid">
            <div className="ESL_TAG">
                {/* ################### UI FOR SEARCH FROM ################## */}
                <div className="card" >
                    <h5>ESL TAG Information</h5>
                    <div className="field" style={{ textAlign: 'right' }}>
                        <Button label="Search_Open" icon="pi pi-search" outlined onClick={() => { actionSearchBin_Open() }} />
                        <Button label="Search_Detail" icon="pi pi-search" outlined onClick={() => { 
                            const selectedBin = getSelectedBinLocation();
                            if (selectedBin && selectedBin.length > 0) {
                                SearchDataBin(selectedBin[0].BIN_LOCATION_CD, selectedBin[0].COMPANY, selectedBin[0].FACTORY);
                            } else {
                                console.log('No bin location selected');
                            }
                        }} />
                        <Button label="Auto Mornitoring" icon="pi pi-heart" outlined onClick={() => { handleGetEslTags() }} />
                        <Button label="Auto Start" icon="pi pi-play" outlined onClick={() => { handleStart() }} />
                        <Button label="Auto Stop" icon="pi pi-stop" outlined onClick={() => { handleStop() }} />
                        <Button label="Product" icon="pi pi-heart" outlined onClick={() => { 
                            if (selecteddt1.length > 0) {
                                const firstRow = selecteddt1[0];
                                actionUpdateProduct(firstRow.ESL_TAG_ID, firstRow.BIN_LOCATION_CD, {});
                            } else {
                                console.log('No items selected for product update');
                            }
                        }} />
                        <Button label="Binding" icon="pi pi-heart" outlined onClick={() => { 
                            if (selecteddt1.length > 0) {
                                const firstRow = selecteddt1[0];
                                actionSendData(firstRow.ESL_TAG_ID);
                            } else {
                                console.log('No items selected for binding');
                            }
                        }} />
                    </div>

                    <DataTable showGridlines tableStyle={{ minWidth: '50rem' }}
                        ref={dt1}
                        value={resultDT1}
                        selection={selecteddt1}
                        sortMode="multiple"
                        sortField="TO_YYMMDD" sortOrder={-1}
                        paginator rows={10} rowsPerPageOptions={[10, 20, 30, 50]}
                        onSelectionChange={(e) => setSelectedDT1(e.value)}
                        key={tableKey}
                    >
                        <Column selectionMode="multiple" exportable={false} headerStyle={{ width: '3rem' }}></Column>
                        <Column field="TO_YYMMDD" header="TO_YYMMDD" sortable ></Column>
                        <Column field="TO_NO" header="TO_NO" sortable ></Column>
                        <Column field="TO_SEQ" header="TO_SEQ"></Column>
                        <Column field="STORE_TP" header="STORE_TP"></Column>
                        <Column field="STORE_COL" header="STORE_COL"></Column>
                        <Column field="STORE_ROW" header="STORE_ROW"></Column>
                        <Column field="BIN_LOCATION_CD" header="BIN_LOCATION"></Column>
                        <Column field="ESL_TAG_ID" header="ESL_TAG_ID" sortable></Column>
                        {/* <Column field="" header="" style={{ width: '0px' }}></Column > */}
                    </DataTable>
                </div>
                <div ref={screenInfo} className="card">
                    <div>
                        <h5>INVENTORY Information</h5>
                    </div>
                    <DataTable showGridlines
                        ref={dt2}
                        value={resultDT2}
                        key={tableKey + 1}
                    >
                        {/* 첫 번째 DataTable */}
                        {/*<Column field="BIN_LOCATION_CD_1" header="Bin Location" body={(rowData) => <span style={{fontSize:'18px', fontWeight: 'bold' }}>{rowData.BIN_LOCATION_CD_1}</span>}></Column>
                            */}
                        <Column field="BIN_LOCATION_CD" header="BIN_LOCATION_CD"  ></Column>
                        <Column field="MATERIAL_CD" header="MATERIAL_CD" ></Column>
                        <Column field="MATERIAL_DESC" header="MATERIAL_DESC" ></Column>
                        <Column field="LC_CD" header="LC_CD" ></Column>
                        <Column field="DIA" header="DIA" ></Column>
                        <Column field="GAL_TP" header="GAL_TP" ></Column>
                        <Column field="GRADE" header="GRADE" ></Column>
                        <Column field="LENGTH" header="LENGTH" ></Column>
                        <Column field="MIN_DIA" header="MIN_DIA" ></Column>
                        <Column field="MAX_DIA" header="MAX_DIA" ></Column>
                        <Column field="M_COUNT" header="M_COUNT" ></Column>
                        <Column field="MIX_TYPE" header="MIX_TYPE" ></Column>
                        <Column field="T_COUNT" header="T_COUNT" ></Column>
                        {/* <Column field="" header="" style={{ width: '0px' }}></Column > */}
                    </DataTable>
                </div>
            </div>
        </div>
    );
};
export default EslTagOpen