"use client";
import { useState } from "react";
import * as XLSX from "xlsx";
import { Card, Metric } from "@tremor/react";
import { postExcelData } from "../../../api/esl";

const EslTag = () => {
  const [excelData, setExcelData] = useState([]);

  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

      setExcelData(jsonData);
    };

    reader.readAsArrayBuffer(file);
  };

  const mapExcelDataToAPIFormat = (excelData) => {
    const headers = excelData[0]; // The first row is assumed to be the headers
    return excelData.slice(1).map(row => {
      let mappedRow = {};
      row.forEach((cell, index) => {
        mappedRow[headers[index]] = cell;
      });
      return mappedRow;
    });
  };

  return (
    <>
      <Card className="mx-auto" decoration="top" decorationColor="lime">
        <Metric>EXCEL DATA MANAGEMENT</Metric>
        <div className="mt-4 flex justify-between items-center">
          <input
            type="file"
            accept=".xlsx, .xls"
            onChange={handleExcelUpload}
            className="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 flex items-center cursor-pointer"
          />
        </div>

        {excelData.length > 0 && (
          <div className="mt-4">
            <h2 className="text-lg font-semibold mb-2">Excel Data:</h2>
            <table className="min-w-full bg-white border border-gray-300">
              <thead>
                <tr>
                  {excelData[0].map((col, index) => (
                    <th key={index} className="py-2 px-4 border-b text-center">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {excelData.slice(1).map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="py-2 px-4 border-b text-center">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            
            {/* Add the Submit Excel Data button here */}
            <button
              className="bg-purple-500 text-white py-2 px-4 rounded hover:bg-purple-600 mt-4"
              onClick={() => {
                const mappedData = mapExcelDataToAPIFormat(excelData);
                postExcelData(mappedData);
              }}
            >
              Submit Excel Data
            </button>
          </div>
        )}
      </Card>
    </>
  );
};

export default EslTag;