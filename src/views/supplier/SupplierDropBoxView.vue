<template>
<div class="upload-container">
<div
class="drop-box"
:class="{ dragging: isDragging, hasFile: selectedFile }"
@dragover.prevent="isDragging = true"
@dragleave.prevent="isDragging = false"
@drop.prevent="handleDrop"
@click="fileInput.click()"
>
<input
ref="fileInput"
type="file"
hidden
@change="handleFileSelect"
/>
 
<div v-if="!selectedFile" class="upload-content">
<div class="upload-icon">↑</div>
 
<h2>Drop your file here</h2>
 
<p>
Drag & drop your file here, or
<span>browse</span>
</p>
 
<small>PNG, JPG, PDF up to 10MB</small>
</div>
 
<div v-else class="file-content">
<div class="file-icon">✓</div>
 
<h2>{{ selectedFile.name }}</h2>
 
<p>{{ formatFileSize(selectedFile.size) }}</p>
 
<button
class="remove-button"
@click.stop="removeFile"
>
Remove File
</button>
</div>
</div>
</div>
</template>
 
<script setup>
import { ref } from 'vue'
 
const fileInput = ref(null)
const selectedFile = ref(null)
const isDragging = ref(false)
 
const handleFileSelect = (event) => {
const file = event.target.files[0]
 
if (file) {
selectedFile.value = file
}
}
 
const handleDrop = (event) => {
isDragging.value = false
 
const file = event.dataTransfer.files[0]
 
if (file) {
selectedFile.value = file
}
}
 
const removeFile = () => {
selectedFile.value = null
fileInput.value.value = ''
}
 
const formatFileSize = (bytes) => {
if (bytes < 1024) return `${bytes} B`
if (bytes < 1024 * 1024) {
return `${(bytes / 1024).toFixed(1)} KB`
}
 
return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>
 
<style scoped>
.upload-container {
min-height: 100vh;
display: flex;
justify-content: center;
align-items: center;
background: #090909;
padding: 30px;
}
 
.drop-box {
width: 520px;
min-height: 300px;
display: flex;
justify-content: center;
align-items: center;
 
background: #111;
border: 2px dashed #444;
border-radius: 18px;
 
color: white;
cursor: pointer;
 
transition: all 0.25s ease;
}
 
.drop-box:hover {
border-color: #e50914;
background: #151515;
box-shadow: 0 0 30px rgba(229, 9, 20, 0.15);
}
 
.drop-box.dragging {
border-color: #ff1a25;
background: #1a0809;
box-shadow: 0 0 40px rgba(229, 9, 20, 0.35);
transform: scale(1.02);
}
 
.drop-box.hasFile {
border-style: solid;
border-color: #e50914;
}
 
.upload-content,
.file-content {
text-align: center;
padding: 40px;
}
 
.upload-icon,
.file-icon {
width: 65px;
height: 65px;
margin: 0 auto 20px;
 
display: flex;
justify-content: center;
align-items: center;
 
border-radius: 50%;
background: #e50914;
 
color: white;
font-size: 32px;
font-weight: bold;
 
box-shadow: 0 0 25px rgba(229, 9, 20, 0.4);
}
 
h2 {
margin: 0 0 10px;
font-size: 22px;
}
 
p {
margin: 0 0 10px;
color: #999;
}
 
p span {
color: #e50914;
font-weight: bold;
}
 
small {
color: #555;
}
 
.file-icon {
background: #e50914;
}
 
.file-content h2 {
max-width: 400px;
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;
}
 
.remove-button {
margin-top: 15px;
padding: 10px 20px;
 
background: transparent;
border: 1px solid #e50914;
border-radius: 8px;
 
color: #e50914;
cursor: pointer;
 
transition: 0.2s;
}
 
.remove-button:hover {
background: #e50914;
color: white;
}
</style>