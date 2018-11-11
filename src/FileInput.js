import React from 'react';

import { uploadFile } from './chunking.service';

const FileInput = () => {

    const handleFile = (file) => {
        uploadFile(file);
    }

    return (
        <div>
            <input type="file" onChange={(e) => handleFile(e.target.files[0])}/>
        </div>
    )
}

export default FileInput;