"use client";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPaperPlane, faPlus, faEdit, faTrash } from "@fortawesome/free-solid-svg-icons";
import { bindImage } from "../../../api/esl";
import { Card, Metric } from "@tremor/react";

const EslBind = () => {
  const initialTag = {
    RequestID: 1,
    apMac: "",
    priceTagCode: "",
    itemRawPic: "",
  };

  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState({ ...initialTag });
  const [showForm, setShowForm] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [previewImage, setPreviewImage] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [nextRequestID, setNextRequestID] = useState(1);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewTag({ ...newTag, [name]: value.toUpperCase() });
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result.replace("data:", "").replace(/^.+,/, "");
        setNewTag((prevTag) => ({ ...prevTag, itemRawPic: base64String }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddTag = () => {
    setShowForm(true);
    setEditMode(false);
    setNewTag({ ...initialTag, RequestID: nextRequestID });
  };

  const handleSaveTag = () => {
    const { apMac, priceTagCode } = newTag;

    if (!apMac || !priceTagCode) {
      setErrorMessage("AP Mac and Price Tag Code are required.");
      return;
    }

    if (editMode && editIndex !== null) {
      const updatedTags = [...tags];
      updatedTags[editIndex] = { ...newTag };
      setTags(updatedTags);
    } else {
      setTags([...tags, { ...newTag }]);
      setNextRequestID(nextRequestID + 1);
    }

    setNewTag({ ...initialTag, RequestID: nextRequestID });
    setShowForm(false);
    setErrorMessage("");
    setEditMode(false);
    setEditIndex(null);
  };

  const handleEditTag = (index) => {
    setEditMode(true);
    setEditIndex(index);
    setShowForm(true);
    setNewTag({ ...tags[index] });
  };

  const handleDeleteTag = (index) => {
    setTags(tags.filter((_, i) => i !== index));
  };

  const handleSendTag = async (index) => {
    const tagToSend = tags[index];
    try {
      await bindImage(tagToSend);
      console.log('Tag sent successfully:', tagToSend);
    } catch (error) {
      console.error('Error sending tag:', error);
    }
  };

  const handleImageClick = (imageSrc) => {
    setPreviewImage(imageSrc);
  };

  const handleClosePreview = () => {
    setPreviewImage(null);
  };

  return (
    <>
      <Card className="mx-auto" decoration="top" decorationColor="lime">
        <Metric>TAG BIND</Metric>
        <div className="mt-4 flex justify-between items-center">
          <div className="flex space-x-4">
            <button
              className="bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 flex items-center"
              onClick={handleAddTag}
            >
              <FontAwesomeIcon icon={faPlus} className="mr-2" />
              Bind Tag
            </button>
          </div>
        </div>

        {showForm && (
          <div className="mt-4">
            {errorMessage && <div className="text-red-500 mb-4">{errorMessage}</div>}
            <form className="mb-4">
              <div className="flex space-x-4">
                <input
                  type="text"
                  name="apMac"
                  value={newTag.apMac}
                  onChange={handleInputChange}
                  placeholder="AP Mac"
                  className="border px-4 py-2 rounded w-full"
                />
                <input
                  type="text"
                  name="priceTagCode"
                  value={newTag.priceTagCode}
                  onChange={handleInputChange}
                  placeholder="Price Tag Code"
                  className="border px-4 py-2 rounded w-full"
                />
              </div>
              <div className="mt-4">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="bg-gray-500 text-white py-2 px-4 rounded hover:bg-gray-600 flex items-center cursor-pointer"
                />
              </div>
              <div className="flex space-x-4 mt-4">
                <button
                  type="button"
                  className="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600"
                  onClick={handleSaveTag}
                >
                  {editMode ? "Update" : "Save"}
                </button>
                <button
                  type="button"
                  className="bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="mt-4">
          <table className="min-w-full bg-white border border-gray-300">
            <thead>
              <tr>
                <th className="py-2 px-4 border-b text-center">Request ID</th>
                <th className="py-2 px-4 border-b text-center">AP Mac</th>
                <th className="py-2 px-4 border-b text-center">Price Tag Code</th>
                <th className="py-2 px-4 border-b text-center">Content</th>
                <th className="py-2 px-4 border-b text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {tags.map((tag, index) => (
                <tr key={index}>
                  <td className="py-2 px-4 border-b text-center">{tag.RequestID}</td>
                  <td className="py-2 px-4 border-b text-center">{tag.apMac}</td>
                  <td className="py-2 px-4 border-b text-center">{tag.priceTagCode}</td>
                  <td className="py-2 px-4 border-b text-center">
                    {tag.itemRawPic && (
                    <img
                     src={`data:image/jpeg;base64,${tag.itemRawPic}`}
                    alt="Tag Content"
                    className="h-6 w-6 object-cover mx-auto cursor-pointer" // Updated height and width
                    onClick={() => handleImageClick(`data:image/jpeg;base64,${tag.itemRawPic}`)}
                         />
                     )}
                    </td>
                  <td className="py-2 px-4 border-b text-center">
                    <button
                      className="bg-yellow-500 text-white py-1 px-3 rounded hover:bg-yellow-600 mr-2"
                      onClick={() => handleEditTag(index)}
                    >
                      <FontAwesomeIcon icon={faEdit} />
                    </button>
                    <button
                      className="bg-red-500 text-white py-1 px-3 rounded hover:bg-red-600 mr-2"
                      onClick={() => handleDeleteTag(index)}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                    <button
                      className="bg-purple-500 text-white py-1 px-3 rounded hover:bg-purple-600"
                      onClick={() => handleSendTag(index)}
                    >
                      <FontAwesomeIcon icon={faPaperPlane} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {previewImage && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-75 z-50"
          onClick={handleClosePreview}
        >
          <img src={previewImage} alt="Preview" />
        </div>
      )}
    </>
  );
};

export default EslBind;
