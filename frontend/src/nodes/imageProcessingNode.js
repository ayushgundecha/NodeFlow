// src/nodes/ImageProcessingNode.js
import React from "react";
import BaseNode from "./baseNode";
import { ReactComponent as PhotographIcon } from "../Assets/PhotographIcon.svg";

export const ImageProcessingNode = ({ id, data }) => {
  const { fields = {}, updateField } = data || {};

  // Reusable handler to update field values
  const handleFieldChange = (fieldName, value) => {
    if (updateField) {
      updateField(fieldName, value);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files.length ? e.target.files[0] : null;
    handleFieldChange("image", file);
  };

  const renderContent = () => (
    <div className="space-y-4">
      {/* Upload Image */}
      <div>
        <label htmlFor={`${id}-file`} className="block text-sm font-medium text-gray-700">
          Upload Image
        </label>
        <input
          id={`${id}-file`}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="mt-1 block w-full text-sm text-gray-500 border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
          aria-label="Upload Image"
        />
      </div>

      {/* Processing Type */}
      <div>
        <label htmlFor={`${id}-processingType`} className="block text-sm font-medium text-gray-700">
          Processing Type
        </label>
        <select
          id={`${id}-processingType`}
          value={fields.processingType || "Resize"}
          onChange={(e) => handleFieldChange("processingType", e.target.value)}
          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          aria-label="Processing Type"
        >
          <option value="Resize">Resize</option>
          <option value="Filter">Filter</option>
          <option value="Compress">Compress</option>
        </select>
      </div>

      {/* Conditional rendering for Resize options */}
      {fields.processingType === "Resize" && (
        <div className="flex space-x-4">
          <div>
            <label htmlFor={`${id}-width`} className="block text-sm font-medium text-gray-700">
              Width
            </label>
            <input
              id={`${id}-width`}
              type="number"
              placeholder="Width in pixels"
              value={fields.width || ""}
              onChange={(e) => handleFieldChange("width", e.target.value)}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              aria-label="Width"
            />
          </div>

          <div>
            <label htmlFor={`${id}-height`} className="block text-sm font-medium text-gray-700">
              Height
            </label>
            <input
              id={`${id}-height`}
              type="number"
              placeholder="Height in pixels"
              value={fields.height || ""}
              onChange={(e) => handleFieldChange("height", e.target.value)}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              aria-label="Height"
            />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <BaseNode
      id={id}
      title="Image Processing"
      description="Resize, filter, or compress images."
      renderContent={renderContent}
      handles={[
        { type: "target", position: "left", id: `${id}-input` },
        { type: "source", position: "right", id: `${id}-output` },
      ]}
      Icon={PhotographIcon}
    />
  );
};
