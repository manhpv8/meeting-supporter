import React, { useState } from 'react';
import { X, Save, RotateCcw, Settings } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  suggestionPrompt: string;
  onUpdatePrompt: (prompt: string) => void;
}

const defaultPrompt = 'Based on this conversation, provide helpful insights, key points, action items, and relevant follow-up suggestions.';

export default function SettingsModal({ isOpen, onClose, suggestionPrompt, onUpdatePrompt }: SettingsModalProps) {
  const [localPrompt, setLocalPrompt] = useState<string>(suggestionPrompt);

  if (!isOpen) return null;

  const handleSave = () => {
    onUpdatePrompt(localPrompt);
    onClose();
  };

  const handleReset = () => {
    setLocalPrompt(defaultPrompt);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center space-x-3">
            <Settings className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-slate-900">AI Suggestions Configuration</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6">
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-medium text-blue-900 mb-2">How it works</h3>
              <p className="text-sm text-blue-700">
                Customize the AI prompt to get more relevant suggestions from your transcriptions. 
                The AI will use this prompt to analyze the conversation content and generate helpful insights.
              </p>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                AI Suggestion Prompt
              </label>
              <textarea
                value={localPrompt}
                onChange={(e) => setLocalPrompt(e.target.value)}
                placeholder="Enter your custom prompt for AI suggestions..."
                className="w-full h-32 p-4 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
              <p className="text-xs text-slate-500">
                This prompt will be used to generate AI suggestions based on your transcription content.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between p-6 border-t border-slate-200 bg-slate-50">
          <button
            onClick={handleReset}
            className="flex items-center space-x-2 px-4 py-2 text-slate-600 hover:text-slate-700 transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Reset to Default</span>
          </button>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:text-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Save className="h-4 w-4" />
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}