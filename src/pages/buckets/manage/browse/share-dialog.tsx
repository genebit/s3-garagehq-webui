import { createDisclosure } from "@/lib/disclosure";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useBucketContext } from "../context";
import { useConfig } from "@/hooks/useConfig";
import { useEffect, useMemo, useState } from "react";
import Input from "@/components/ui/input";
import Button from "@/components/ui/button";
import Checkbox from "@/components/ui/checkbox";
import { Copy, FileWarningIcon } from "lucide-react";
import { copyToClipboard } from "@/lib/utils";

// keys are full object keys (prefix included).
export const shareDialog = createDisclosure<{ keys: string[] }>();

const ShareDialog = () => {
  const { isOpen, data } = shareDialog.use();
  const { bucket, bucketName } = useBucketContext();
  const { data: config } = useConfig();
  const [domain, setDomain] = useState(bucketName);

  const websitePort = config?.s3_web?.bind_addr?.split(":").pop() || "80";
  const rootDomain = config?.s3_web?.root_domain;

  const domains = useMemo(
    () => [
      bucketName,
      bucketName + rootDomain,
      bucketName + rootDomain + `:${websitePort}`,
    ],
    [bucketName, config?.s3_web]
  );

  useEffect(() => {
    setDomain(bucketName);
  }, [domains]);

  const keys = data?.keys || [];
  const urls = keys.map((key) => "http://" + domain + "/" + key);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && shareDialog.close()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="truncate">
            {keys.length > 1 ? `Share ${keys.length} files` : `Share ${keys[0] || ""}`}
          </DialogTitle>
        </DialogHeader>

        {!bucket.websiteAccess && (
          <Alert>
            <FileWarningIcon />
            <AlertDescription>
              Sharing is only available for buckets with enabled website
              access.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-row gap-4 overflow-x-auto pb-2">
          {domains.map((item) => (
            <Checkbox
              key={item}
              label={item}
              checked={item === domain}
              onChange={() => setDomain(item)}
            />
          ))}
        </div>

        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {urls.map((url) => (
            <div key={url} className="relative">
              <Input
                value={url}
                readOnly
                className="w-full pr-12"
                onFocus={(e) => e.target.select()}
              />
              <Button
                icon={Copy}
                onClick={() => copyToClipboard(url)}
                className="absolute right-0 top-0"
                variant="ghost"
                size="icon"
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          {urls.length > 1 ? (
            <Button
              variant="secondary"
              icon={Copy}
              onClick={() => copyToClipboard(urls.join("\n"))}
            >
              Copy all
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => shareDialog.close()}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ShareDialog;
