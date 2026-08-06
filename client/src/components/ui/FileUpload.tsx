import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { IconUpload } from '@tabler/icons-react';
import './FileUpload.css';

const mainVariant = {
  initial: {
    x: 0,
    y: 0,
  },
  animate: {
    x: 20,
    y: -20,
    opacity: 0.9,
  },
};

const secondaryVariant = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
  },
};

interface FileUploadProps {
  onChange?: (files: File[]) => void;
  accept?: Record<string, string[]>;
}

export const FileUpload = ({ 
  onChange, 
  accept = { '.json': ['application/json'] } 
}: FileUploadProps) => {
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (newFiles: File[]) => {
    setFiles((prevFiles) => [...prevFiles, ...newFiles]);
    onChange && onChange(newFiles);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFileChange(Array.from(e.target.files));
    }
  };

  return (
    <div className="file-upload-container">
      <motion.div
        onClick={handleClick}
        whileHover="animate"
        className="file-upload-dropzone group/file"
      >
        <input
          ref={fileInputRef}
          id="file-upload-handle"
          type="file"
          onChange={handleChange}
          className="file-upload-hidden"
          accept={Object.keys(accept).join(',')}
        />
        
        <div className="file-upload-grid-bg">
          <GridPattern />
        </div>

        <div className="file-upload-content">
          <p className="file-upload-title">
            Upload JSON metadata
          </p>
          <p className="file-upload-subtitle">
            Drag or drop your files here or click to upload
          </p>
          
          <div className="file-upload-files-area">
            {files.length > 0 &&
              files.map((file, idx) => (
                <motion.div
                  key={"file" + idx}
                  layoutId={idx === 0 ? "file-upload" : "file-upload-" + idx}
                  className={`file-upload-file-item glass-1`}
                >
                  <div className="file-upload-file-header">
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      layout
                      className="file-upload-file-name"
                      title={file.name}
                    >
                      {file.name}
                    </motion.p>
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      layout
                      className="file-upload-file-size"
                    >
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </motion.p>
                  </div>

                  <div className="file-upload-file-meta">
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      layout
                      className="file-upload-file-type"
                    >
                      {file.type || 'application/octet-stream'}
                    </motion.p>

                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      layout
                      className="file-upload-file-modified"
                    >
                      modified{' '}
                      {new Date(file.lastModified).toLocaleDateString()}
                    </motion.p>
                  </div>
                </motion.div>
              ))}
            
            {!files.length && (
              <motion.div
                layoutId="file-upload"
                variants={mainVariant}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 20,
                }}
                className="file-upload-placeholder glass-1"
              >
                {files.length === 0 && (
                  <IconUpload size={20} className="file-upload-icon" />
                )}
              </motion.div>
            )}

            {!files.length && (
              <motion.div
                variants={secondaryVariant}
                className="file-upload-dashed-border"
              ></motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export function GridPattern() {
  const columns = 41;
  const rows = 11;
  
  return (
    <div className="file-upload-grid">
      {Array.from({ length: rows }).map((_, row) =>
        Array.from({ length: columns }).map((_, col) => {
          const index = row * columns + col;
          return (
            <div
              key={`${col}-${row}`}
              className={`file-upload-grid-cell ${
                index % 2 === 0
                  ? 'file-upload-grid-even'
                  : 'file-upload-grid-shadow'
              }`}
            />
          );
        }),
      )}
    </div>
  );
}
