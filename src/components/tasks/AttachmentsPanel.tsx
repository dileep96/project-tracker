import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DownloadSimple, File, Trash, UploadSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useAttachments } from "@/hooks/use-task-detail";
import { addAttachment, deleteAttachment } from "@/lib/queries/attachments";
import type { Attachment } from "@/lib/db";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentRow({ attachment }: { attachment: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = attachment.mimeType.startsWith("image/");

  useEffect(() => {
    const objectUrl = URL.createObjectURL(attachment.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [attachment.blob]);

  return (
    <div className="flex items-center gap-3 rounded-md border border-border p-2">
      {isImage && url ? (
        <img src={url} alt={attachment.filename} className="size-10 shrink-0 rounded object-cover" />
      ) : (
        <div className="flex size-10 shrink-0 items-center justify-center rounded bg-muted">
          <File className="size-4.5 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{attachment.filename}</p>
        <p className="text-xs text-muted-foreground">{formatSize(attachment.size)}</p>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="Download" asChild>
        <a href={url ?? "#"} download={attachment.filename}>
          <DownloadSimple />
        </a>
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Delete attachment"
        onClick={async () => {
          await deleteAttachment(attachment.id);
          toast.success("Attachment deleted");
        }}
      >
        <Trash />
      </Button>
    </div>
  );
}

export function AttachmentsPanel({ taskId }: { taskId: string }) {
  const attachments = useAttachments(taskId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      await addAttachment(taskId, file);
    }
    toast.success(files.length > 1 ? "Files attached" : "File attached");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {(attachments ?? []).map((a) => (
          <AttachmentRow key={a.id} attachment={a} />
        ))}
        {attachments?.length === 0 && (
          <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
            No files attached yet.
          </p>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
        <UploadSimple /> Attach a file
      </Button>
    </div>
  );
}
