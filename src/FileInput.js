import React, { useState } from 'react';

import { uploadFile } from './chunking.service';
import FileProgress from './FileProgress';

const FileInput = () => {

    const [fileUploads, setFileUploads] = useState({});

    const handleFile = (file) => {
        const timestamp = Date.now();
        setFileUploads(Object.assign(fileUploads, {}, {
            [timestamp]: {
                filename: file.name,
                progress: 0
            }
        }));

        // if using this in a real app you will need to handle unsubscribing from the uploadFile observable
        // using useEffect hook or something
        uploadFile(file).subscribe(progress => {
            if (progress !== 'complete') {
                setFileUploads(Object.assign(fileUploads, {}, {
                    [timestamp]: {
                        filename: file.name,
                        progress
                    }
                }));
            }
        });
    }

    const clearFileInput = (target) => {
        target.value = null;
    }

    var fileList = Object.keys(fileUploads).map(function (key) {
        return <FileProgress filename={fileUploads[key].filename}
            key={key}
            progress={fileUploads[key].progress} />
    });

    return (
        <div>
            <input type="file"
                onChange={(e) => handleFile(e.target.files[0])}
                onClick={(e) => clearFileInput(e.target)}
            />
            <ul className="file-list">{fileList}</ul>
        </div>
    )
}

export default FileInput;