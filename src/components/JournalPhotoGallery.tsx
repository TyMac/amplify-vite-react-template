import React, { useState, useMemo } from "react";
import { getUrl } from "aws-amplify/storage";
import type { Schema } from "../../amplify/data/resource";

interface PhotoItem {
  imageKey: string;
  chatSessionId: string;
  chatName: string;
  messageId: string;
}

interface JournalPhotoGalleryProps {
  chatSessions: Schema["ChatSession"]["type"][];
  pinnedChatIds: (unknown)[] | unknown;
}

export default function JournalPhotoGallery({ chatSessions, pinnedChatIds }: JournalPhotoGalleryProps) {
  const [expandedPhotoKey, setExpandedPhotoKey] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());

  // Extract all images from pinned chats
  const photos = useMemo(() => {
    const result: PhotoItem[] = [];
    
    const chatIdsArray = Array.isArray(pinnedChatIds)
      ? pinnedChatIds.filter((id): id is string => typeof id === 'string')
      : [];
    
    chatIdsArray.forEach((chatId) => {
      const chat = chatSessions.find((c) => c.id === chatId);
      if (!chat) return;
      
      const messages = Array.isArray(chat.messages) ? chat.messages : [];
      const reversedMessages = [...messages].reverse();
      
      reversedMessages.forEach((msg) => {
        if (msg && typeof msg === 'object' && 'imageKey' in msg) {
          const imageKey = (msg as any).imageKey;
          const messageId = (msg as any).id;
          if (typeof imageKey === 'string') {
            result.push({
              imageKey,
              chatSessionId: chatId,
              chatName: typeof chat.name === 'string' ? chat.name : "Untitled Chat",
              messageId: typeof messageId === 'string' ? messageId : "",
            });
          }
        }
      });
    });

    return result;
  }, [chatSessions, pinnedChatIds]) as PhotoItem[];

  // Load image URL when needed
  const getImageUrl = async (imageKey: string): Promise<string | null> => {
    if (imageUrls.has(imageKey)) {
      const cached = imageUrls.get(imageKey);
      if (cached) return cached;
    }

    try {
      const result = await getUrl({ key: imageKey });
      const url = result.url?.toString() || null;
      if (url) {
        setImageUrls((prev) => new Map(prev).set(imageKey, url));
      }
      return url;
    } catch (error) {
      console.error("Failed to load image:", error);
      return null;
    }
  };

  if (!Array.isArray(photos) || photos.length === 0) {
    return (
      <div className="p-3 border-t border-base-200">
        <p className="text-xs text-base-content/40 text-center py-4">
          Photos from pinned chats will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-base-200">
      <div className="p-3 border-b border-base-200">
        <h3 className="text-xs font-semibold text-base-content/70 uppercase tracking-wider">
          Photos
        </h3>
        <p className="text-xs text-base-content/40 mt-1">{photos.length} photo{photos.length !== 1 ? "s" : ""}</p>
      </div>

      {/* Photo grid */}
      <div className="p-2 overflow-y-auto max-h-64">
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <PhotoThumbnail
              key={`${photo.messageId}-${photo.imageKey}`}
              photo={photo}
              getImageUrl={getImageUrl}
              onExpand={() => setExpandedPhotoKey(photo.imageKey)}
            />
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {expandedPhotoKey && (
        <PhotoLightbox
          imageKey={expandedPhotoKey}
          photo={photos.find((p) => p.imageKey === expandedPhotoKey)}
          getImageUrl={getImageUrl}
          onClose={() => setExpandedPhotoKey(null)}
        />
      )}
    </div>
  );
}

function PhotoThumbnail({
  photo,
  getImageUrl,
  onExpand,
}: {
  photo: PhotoItem;
  getImageUrl: (key: string) => Promise<string | null>;
  onExpand: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load image URL on mount
  React.useEffect(() => {
    (async () => {
      const imageUrl = await getImageUrl(photo.imageKey);
      setUrl(imageUrl);
      setLoading(false);
    })();
  }, [photo.imageKey, getImageUrl]);

  return (
    <button
      onClick={onExpand}
      className="relative w-full aspect-square rounded-lg overflow-hidden border border-base-200 hover:border-primary transition-colors group"
      title={photo.chatName}
    >
      {loading ? (
        <div className="w-full h-full bg-base-200 flex items-center justify-center">
          <span className="loading loading-spinner loading-sm" />
        </div>
      ) : url ? (
        <>
          <img
            src={url}
            alt={`Photo from ${photo.chatName}`}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5 text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
            </svg>
          </div>
        </>
      ) : (
        <div className="w-full h-full bg-base-200 flex items-center justify-center text-base-content/20">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
      )}
    </button>
  );
}

function PhotoLightbox({
  imageKey,
  photo,
  getImageUrl,
  onClose,
}: {
  imageKey: string;
  photo?: PhotoItem;
  getImageUrl: (key: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      const imageUrl = await getImageUrl(imageKey);
      setUrl(imageUrl);
    })();
  }, [imageKey, getImageUrl]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-2xl max-h-[90vh] bg-base-100 rounded-lg overflow-hidden shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        {photo && (
          <div className="px-4 py-3 border-b border-base-200 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-base-content truncate">{photo.chatName}</p>
              <p className="text-xs text-base-content/40">From chat</p>
            </div>
            <button
              onClick={onClose}
              className="btn btn-ghost btn-sm btn-square flex-shrink-0"
              title="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Image */}
        <div className="bg-base-200 flex items-center justify-center" style={{ maxHeight: "70vh" }}>
          {url ? (
            <img src={url} alt="Full size" className="max-w-full max-h-full" />
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <span className="loading loading-spinner loading-md" />
              <p className="text-sm text-base-content/40 mt-4">Loading image...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
