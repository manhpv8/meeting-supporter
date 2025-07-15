import React, { useState } from 'react';
import { Settings } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemPrompt: string;
  onUpdateSystemPrompt: (prompt: string) => void;
  suggestionPrompt: string;
  onUpdateSuggestionPrompt: (prompt: string) => void;
  summaryPrompt: string;
  onUpdateSummaryPrompt: (prompt: string) => void;
  summaryTriggerThreshold: number;
  onUpdateSummaryTriggerThreshold: (threshold: number) => void;
  geminiApiKey: string;
  onUpdateGeminiApiKey: (key: string) => void;
  geminiModel: string;
  onUpdateGeminiModel: (model: string) => void;
  maxSuggestionsTokens: number; // New prop for max suggestion tokens
  onUpdateMaxSuggestionsTokens: (tokens: number) => void; // New update function
  maxSummaryTokens: number; // New prop for max summary tokens
  onUpdateMaxSummaryTokens: (tokens: number) => void; // New update function
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  systemPrompt,
  onUpdateSystemPrompt,
  suggestionPrompt,
  onUpdateSuggestionPrompt,
  summaryPrompt,
  onUpdateSummaryPrompt,
  summaryTriggerThreshold,
  onUpdateSummaryTriggerThreshold,
  geminiApiKey,
  onUpdateGeminiApiKey,
  geminiModel,
  onUpdateGeminiModel,
  maxSuggestionsTokens,
  onUpdateMaxSuggestionsTokens,
  maxSummaryTokens,
  onUpdateMaxSummaryTokens,
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState('basic'); // 'basic' or 'advanced'

  const handleSave = () => {
    // Các hàm onUpdate đã lưu vào localStorage, vì vậy chỉ cần đóng modal
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md">
        <h3 className="text-xl font-bold mb-4 text-slate-800">Cài đặt</h3>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 mb-4">
          <button
            className={`py-2 px-4 text-sm font-medium ${
              activeTab === 'basic'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-slate-500 hover:text-blue-600'
            }`}
            onClick={() => setActiveTab('basic')}
          >
            Cơ bản
          </button>
          <button
            className={`py-2 px-4 text-sm font-medium ${
              activeTab === 'advanced'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-slate-500 hover:text-blue-600'
            }`}
            onClick={() => setActiveTab('advanced')}
          >
            Nâng cao
          </button>
        </div>

        {/* Basic Tab Content */}
        {activeTab === 'basic' && (
          <div>
            <div className="mb-4">
              <label htmlFor="geminiApiKey" className="block text-sm font-medium text-slate-700 mb-1">
                Khóa API Gemini
              </label>
              <input
                type="password"
                id="geminiApiKey"
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                value={geminiApiKey}
                onChange={(e) => onUpdateGeminiApiKey(e.target.value)}
                placeholder="Nhập khóa API Gemini của bạn"
              />
              <p className="text-xs text-slate-500 mt-1">
                Bắt buộc để có thông tin chi tiết từ AI. Lấy khóa từ Google AI Studio.
              </p>
            </div>
            <div className="mb-4">
              <label htmlFor="geminiModel" className="block text-sm font-medium text-slate-700 mb-1">
                Mô hình Gemini
              </label>
              <select
                id="geminiModel"
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                value={geminiModel}
                onChange={(e) => onUpdateGeminiModel(e.target.value)}
              >
                <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                {/* Thêm các mô hình khác nếu cần */}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Chọn mô hình Gemini để tạo AI.
              </p>
            </div>
          </div>
        )}

        {/* Advanced Tab Content */}
        {activeTab === 'advanced' && (
          <div>
            {/* System Prompt (General AI Context) */}
            <div className="mb-6 pb-4 border-b border-slate-200">
              <h4 className="text-md font-semibold text-slate-700 mb-2">Lời nhắc hệ thống chung (General System Prompt)</h4>
              <p className="text-sm text-slate-600 mb-3">
                Lời nhắc này định nghĩa vai trò và ngữ cảnh tổng thể cho AI.
              </p>
              <textarea
                id="systemPrompt"
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                value={systemPrompt}
                onChange={(e) => onUpdateSystemPrompt(e.target.value)}
                placeholder="Ví dụ: Bạn là một trợ lý họp thông minh."
              ></textarea>
            </div>

            {/* Customize Suggestions */}
            <div className="mb-6 pb-4 border-b border-slate-200">
              <h4 className="text-md font-semibold text-slate-700 mb-2">Tùy chỉnh Gợi ý (Suggestions)</h4>
              <p className="text-sm text-slate-600 mb-3">
                Lời nhắc này hướng dẫn AI tạo các gợi ý phản hồi hoặc câu hỏi nhanh dựa trên các câu gần đây.
              </p>
              <textarea
                id="suggestionPrompt"
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                value={suggestionPrompt}
                onChange={(e) => onUpdateSuggestionPrompt(e.target.value)}
                placeholder="Ví dụ: Dựa trên câu nói gần đây, hãy cung cấp một gợi ý phản hồi hữu ích."
              ></textarea>
            </div>

            {/* Customize Summary */}
            <div className="mb-6 pb-4 border-b border-slate-200">
              <h4 className="text-md font-semibold text-slate-700 mb-2">Tùy chỉnh Tóm tắt (Summary)</h4>
              <p className="text-sm text-slate-600 mb-3">
                Lời nhắc này hướng dẫn AI tạo bản tóm tắt toàn diện về cuộc trò chuyện.
              </p>
              <textarea
                id="summaryPrompt"
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                value={summaryPrompt}
                onChange={(e) => onUpdateSummaryPrompt(e.target.value)}
                placeholder="Ví dụ: Vui lòng tóm tắt các điểm chính của cuộc trò chuyện này."
              ></textarea>
            </div>

            {/* Minimum Sentences for Summary */}
            <div className="mb-4">
              <h4 className="text-md font-semibold text-slate-700 mb-2">Số câu tối thiểu để Tóm tắt</h4>
              <p className="text-sm text-slate-600 mb-3">
                Số lượng câu hoàn chỉnh tối thiểu để AI tự động tạo tóm tắt mới.
              </p>
              <input
                type="number"
                id="summaryTriggerThreshold"
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                value={summaryTriggerThreshold}
                onChange={(e) => onUpdateSummaryTriggerThreshold(parseInt(e.target.value) || 0)}
                min="1"
                placeholder="Ví dụ: 3"
              />
            </div>

            {/* Max Suggestions Tokens */}
            <div className="mb-4">
              <label htmlFor="maxSuggestionsTokens" className="block text-sm font-medium text-slate-700 mb-1">
                Số token tối đa cho Gợi ý
              </label>
              <input
                type="number"
                id="maxSuggestionsTokens"
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                value={maxSuggestionsTokens}
                onChange={(e) => onUpdateMaxSuggestionsTokens(parseInt(e.target.value) || 0)}
                min="1"
                placeholder="Ví dụ: 100"
              />
              <p className="text-xs text-slate-500 mt-1">
                Giới hạn số lượng từ (tokens) AI tạo ra cho mỗi gợi ý.
              </p>
            </div>

            {/* Max Summary Tokens */}
            <div className="mb-4">
              <label htmlFor="maxSummaryTokens" className="block text-sm font-medium text-slate-700 mb-1">
                Số token tối đa cho Tóm tắt
              </label>
              <input
                type="number"
                id="maxSummaryTokens"
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                value={maxSummaryTokens}
                onChange={(e) => onUpdateMaxSummaryTokens(parseInt(e.target.value) || 0)}
                min="1"
                placeholder="Ví dụ: 500"
              />
              <p className="text-xs text-slate-500 mt-1">
                Giới hạn số lượng từ (tokens) AI tạo ra cho mỗi bản tóm tắt.
              </p>
            </div>
          </div>
        )}

        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-medium transition-all duration-200"
          >
            Hủy
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all duration-200"
          >
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;