"use client";

import { useState } from "react";

interface CodePanelProps {
  code: string;
  onUpdate: (code: string) => void;
}

export default function CodePanel({ code, onUpdate }: CodePanelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(code);

  const handleEdit = () => {
    setDraft(code);
    setEditing(true);
  };

  const handleApply = () => {
    onUpdate(draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(code);
    setEditing(false);
  };

  return (
    <div className="p-3 bg-gray-800 rounded-lg space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white text-sm">Procedural Code</h3>
        {!editing ? (
          <button
            onClick={handleEdit}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Edit
          </button>
        ) : (
          <div className="flex gap-1">
            <button
              onClick={handleApply}
              className="px-2 py-0.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors"
            >
              Apply
            </button>
            <button
              onClick={handleCancel}
              className="px-2 py-0.5 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full h-64 bg-gray-900 text-gray-200 text-xs font-mono p-2 rounded border border-gray-700 resize-none focus:outline-none focus:border-blue-500"
        />
      ) : (
        <pre className="w-full h-48 overflow-auto bg-gray-900 text-gray-300 text-xs font-mono p-2 rounded border border-gray-700">
          {code || "No code loaded"}
        </pre>
      )}
    </div>
  );
}
