import React, { useState, useEffect } from 'react';
import { Upload, Button, message, Image, Row, Col, Popconfirm } from 'antd';
import { UploadOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../services/httpClient';

const UploadMicroImage = ({ surgicalReportId }) => {
    const [fileList, setFileList] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (surgicalReportId) {
            fetchImages(surgicalReportId);
        } else {
            setFileList([]); // ไม่มี reportId ให้เคลียร์รูป
        }
    }, [surgicalReportId]);

    const fetchImages = async (reportId) => {
        setLoading(true);
        try {
            // สมมติว่ามี API สำหรับดึงรูปภาพของรายงาน
            const response = await api.get(`/surgical-reports/${reportId}/images`);
            const fetchedFiles = response.data.map(img => ({
                uid: img.id, // ใช้ id รูปเป็น uid
                name: img.filename,
                status: 'done',
                url: img.file_url, // URL ของรูปภาพ
            }));
            setFileList(fetchedFiles);
        } catch (error) {
            console.error("Failed to fetch microscopic images:", error);
            message.error("ไม่สามารถดึงรูปภาพได้");
        } finally {
            setLoading(false);
        }
    };

    const handleUpload = async (options) => {
        const { file, onSuccess, onError } = options;
        setLoading(true);

        // ต้องมี surgicalReportId ก่อนถึงจะอัปโหลดได้
        if (!surgicalReportId) {
            message.error("กรุณาบันทึกรายงานเป็นฉบับร่างก่อน จึงจะสามารถอัปโหลดรูปได้");
            onError(new Error("No report ID available"));
            setLoading(false);
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        // สมมติว่า API รับ surgical_report_id ใน path หรือ form data
        // API: POST /surgical-reports/{surgicalReportId}/images/
        
        try {
            const response = await api.post(`/surgical-reports/${surgicalReportId}/images`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            message.success(`${file.name} อัปโหลดสำเร็จ`);
            onSuccess(response.data); // ส่งข้อมูลกลับไปที่ Antd Upload
            fetchImages(surgicalReportId); // รีเฟรชรูปภาพ
        } catch (error) {
            console.error("Upload error:", error);
            message.error(`${file.name} อัปโหลดไม่สำเร็จ`);
            onError(error);
        } finally {
            setLoading(false);
        }
    };

    const handleRemove = async (file) => {
        setLoading(true);
        try {
            // สมมติว่ามี API สำหรับลบรูป
            await api.delete(`/surgical-reports/images/${file.uid}`); // ใช้ uid ที่เก็บเป็น id รูป
            message.success(`รูปภาพ ${file.name} ถูกลบแล้ว`);
            fetchImages(surgicalReportId); // รีเฟรชรูปภาพ
            return true;
        } catch (error) {
            console.error("Delete error:", error);
            message.error(`ไม่สามารถลบรูปภาพ ${file.name} ได้`);
            return false;
        } finally {
            setLoading(false);
        }
    };

    return (
        <Spin spinning={loading}>
            <Upload
                listType="picture-card"
                fileList={fileList}
                customRequest={handleUpload}
                onRemove={handleRemove}
                // ต้องระบุ showUploadList เพื่อแสดงปุ่มลบ/ดู
                showUploadList={{
                    showPreviewIcon: true,
                    showRemoveIcon: true,
                }}
                accept="image/*"
            >
                {fileList.length >= 8 ? null : (
                    <Button icon={<UploadOutlined />} disabled={!surgicalReportId}>
                        อัปโหลดรูปภาพ
                    </Button>
                )}
            </Upload>
            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                {surgicalReportId ? 'สามารถอัปโหลดรูปภาพได้สูงสุด 8 ภาพต่อรายงาน' : 'กรุณาบันทึกรายงานเป็นฉบับร่างก่อนอัปโหลดรูปภาพ'}
            </Text>
        </Spin>
    );
};

export default UploadMicroImage;