/**
 * SIAE — Módulo de Gastos a Reserva de Comprobar (GRC).
 * Interfaz de usuario para control de anticipos, firmas por PDF, comprobaciones fiscales y tiempos.
 */

import React, { useState, useEffect } from 'react';
import {
  Table,
  Card,
  Row,
  Col,
  Statistic,
  Button,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  Tabs,
  Upload,
  message,
  Timeline,
  Progress,
  Tooltip,
  Alert,
  Popconfirm,
  Spin
} from 'antd';
import {
  PlusOutlined,
  UploadOutlined,
  EyeOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  DollarOutlined,
  ArrowRightOutlined,
  EditOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  CheckOutlined,
  InboxOutlined,
  SyncOutlined,
  CloseOutlined,
  FileZipOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { TabPane } = Tabs;
const { TextArea } = Input;
const { Dragger } = Upload;

const STATUS_MAP = {
  borrador: { label: 'Borrador', color: 'default' },
  solicitado: { label: 'Solicitado', color: 'blue' },
  aprobado: { label: 'Aprobado', color: 'orange' },
  comprobacion_pendiente: { label: 'Comp. Pendiente', color: 'cyan' },
  comprobado: { label: 'Comprobado', color: 'green' },
  devolucion_realizada: { label: 'Devolución Realizada', color: 'geekblue' },
  rechazado: { label: 'Rechazado', color: 'red' }
};

export default function GastosReservaComprobarPage() {
  const { user } = useAuth();
  const [grcList, setGrcList] = useState([]);
  const getFileUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const apiBase = apiClient.defaults.baseURL || '';
    const backendBase = apiBase.replace('/api/v1', '');
    return `${backendBase}${path}`;
  };
  const getElapsedTime = (targetDate) => {
    if (!selectedGrc?.firma_solicitante_fecha || !targetDate) return null;
    const start = dayjs(selectedGrc.firma_solicitante_fecha);
    const end = dayjs(targetDate);
    const diffHrs = end.diff(start, 'hour', true);
    if (diffHrs >= 24) {
      const diffDays = end.diff(start, 'day', true);
      return `${diffDays.toFixed(1)} días`;
    }
    return `${diffHrs.toFixed(1)} hrs`;
  };

  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [projects, setProjects] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  
  // PDF Parsing states
  const [parsingPdf, setParsingPdf] = useState(false);
  const [parsedSignatures, setParsedSignatures] = useState(null);
  const [tempPdfPath, setTempPdfPath] = useState(null);
  const [tempItems, setTempItems] = useState([]);
  
  // Bulk Invoice upload states
  const [matchedInvoices, setMatchedInvoices] = useState([]);
  const [processingFiles, setProcessingFiles] = useState(false);
  const [isUploadingMulti, setIsUploadingMulti] = useState(false);
  
  // Modales
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGrc, setEditingGrc] = useState(null);
  const [form] = Form.useForm();

  // Modal de Carga de Facturas XML/PDF
  const [invoiceForm] = Form.useForm();
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [xmlFileList, setXmlFileList] = useState([]);
  const [pdfFileList, setPdfFileList] = useState([]);
  
  // Detalle GRC
  const [selectedGrc, setSelectedGrc] = useState(null);

  // Modal de Carga de Devolución
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnFileList, setReturnFileList] = useState([]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState('signatures');
  
  // Alertas de contraste del PDF
  const [pdfWarnings, setPdfWarnings] = useState([]);

  useEffect(() => {
    fetchGrcs();
    fetchStats();
    fetchCatalogos();
  }, []);

  const fetchGrcs = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/gastos-reserva-comprobar', { params: { limit: 100 } });
      setGrcList(res.data.items || []);
    } catch (error) {
      message.error('Error al cargar la lista de GRC');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await apiClient.get('/gastos-reserva-comprobar/stats');
      setStats(res.data);
    } catch (error) {
      console.error('Error al cargar estadísticas', error);
    }
  };

  const fetchCatalogos = async () => {
    try {
      const [accRes, catRes, usersRes] = await Promise.all([
        apiClient.get('/accounts'),
        apiClient.get('/petty-cash/categories?active_only=true'),
        apiClient.get('/users/options')
      ]);

      // Excluir la cuenta del Fondo Fijo (Caja Chica) ya que es de uso exclusivo de ese módulo
      const grcAccounts = (accRes.data || []).filter(a => a.account_number !== "FF-DEO-01" && !a.name.toLowerCase().includes("fondo fijo"));
      setAccounts(grcAccounts);
      
      setCategories(catRes.data || []);
      setUsers(usersRes.data || []);
    } catch (error) {
      console.error('Error al cargar catálogos', error);
    }
  };

  const handleOpenCreate = () => {
    setEditingGrc(null);
    form.resetFields();
    setTempPdfPath(null);
    setTempItems([]);
    setParsedSignatures(null);
    if (user) {
      form.setFieldsValue({ solicitante_id: user.id });
    }
    setIsFormOpen(true);
  };

  const handleOpenEdit = (grc) => {
    setEditingGrc(grc);
    setTempPdfPath(grc.solicitud_pdf_path);
    setTempItems(grc.items || []);
    setParsedSignatures(null);
    form.setFieldsValue({
      folio_episa: grc.folio_episa,
      fecha_pago_servicio: grc.fecha_pago_servicio ? dayjs(grc.fecha_pago_servicio) : null,
      justificacion: grc.justificacion,
      observaciones: grc.observaciones,
      monto_solicitado: grc.monto_solicitado,
      account_id: grc.account_id,
      category_id: grc.category_id,
      status: grc.status,
      asistente_id: grc.asistente_id,
      solicitante_id: grc.solicitante_id
    });
    setIsFormOpen(true);
  };

  const handlePdfParse = async (file) => {
    setParsingPdf(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await apiClient.post('/gastos-reserva-comprobar/parse-pdf', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      message.success('PDF de solicitud analizado con éxito. Campos autocompletados.');
      const d = res.data;
      
      form.setFieldsValue({
        folio_episa: d.folio_episa || '',
        monto_solicitado: d.monto_solicitado || 0,
        justificacion: d.justificacion || '',
        observaciones: d.observaciones || '',
        fecha_pago_servicio: d.fecha_pago_servicio ? dayjs(d.fecha_pago_servicio) : null,
        account_id: d.account_id || form.getFieldValue('account_id') || undefined,
        solicitante_id: d.solicitante_id || form.getFieldValue('solicitante_id') || user?.id,
      });

      setTempPdfPath(d.solicitud_pdf_path);
      setTempItems(d.items || []);
      
      // Guardar firmas extraídas
      setParsedSignatures({
        firma_solicitante_nombre: d.firma_solicitante_nombre,
        firma_solicitante_fecha: d.firma_solicitante_fecha,
        firma_solicitante_hash: d.firma_solicitante_hash,
        
        firma_revisor_nombre: d.firma_revisor_nombre,
        firma_revisor_fecha: d.firma_revisor_fecha,
        firma_revisor_hash: d.firma_revisor_hash,
        
        firma_jefe_nombre: d.firma_jefe_nombre,
        firma_jefe_fecha: d.firma_jefe_fecha,
        firma_jefe_hash: d.firma_jefe_hash,
        
        firma_adquisiciones_nombre: d.firma_adquisiciones_nombre,
        firma_adquisiciones_fecha: d.firma_adquisiciones_fecha,
        firma_adquisiciones_hash: d.firma_adquisiciones_hash,
        
        firma_director_nombre: d.firma_director_nombre,
        firma_director_fecha: d.firma_director_fecha,
        firma_director_hash: d.firma_director_hash,
        
        firma_tesoreria_nombre: d.firma_tesoreria_nombre,
        firma_tesoreria_fecha: d.firma_tesoreria_fecha,
        firma_tesoreria_hash: d.firma_tesoreria_hash,
        
        firma_contabilidad_nombre: d.firma_contabilidad_nombre,
        firma_contabilidad_fecha: d.firma_contabilidad_fecha,
        firma_contabilidad_hash: d.firma_contabilidad_hash,
      });
    } catch (error) {
      console.error(error);
      message.error(error.response?.data?.detail || 'Error al analizar el PDF de solicitud');
    } finally {
      setParsingPdf(false);
    }
    return false; // prevent auto-upload
  };

  const handleSaveGrc = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        fecha_pago_servicio: values.fecha_pago_servicio ? values.fecha_pago_servicio.format('YYYY-MM-DD') : null,
        solicitud_pdf_path: tempPdfPath,
        items: tempItems,
        ...parsedSignatures
      };

      if (editingGrc) {
        await apiClient.put(`/gastos-reserva-comprobar/${editingGrc.id}`, payload);
        message.success('Solicitud GRC actualizada correctamente');
      } else {
        await apiClient.post('/gastos-reserva-comprobar', payload);
        message.success('Solicitud GRC creada en borrador');
      }
      setIsFormOpen(false);
      fetchGrcs();
      fetchStats();
    } catch (error) {
      if (error.response?.data?.detail) {
        message.error(error.response.data.detail);
      } else {
        message.error('Error al guardar la solicitud');
      }
    }
  };

  const handleDeleteGrc = async (id) => {
    try {
      await apiClient.delete(`/gastos-reserva-comprobar/${id}`);
      message.success('Solicitud eliminada');
      fetchGrcs();
      fetchStats();
      if (selectedGrc?.id === id) {
        setIsDetailOpen(false);
        setSelectedGrc(null);
      }
    } catch (error) {
      message.error('Error al eliminar la solicitud');
    }
  };

  const handleOpenDetail = async (grc) => {
    setPdfWarnings([]);
    try {
      const res = await apiClient.get(`/gastos-reserva-comprobar/${grc.id}`);
      setSelectedGrc(res.data);
      setIsDetailOpen(true);
      setDetailTab('signatures');
    } catch (error) {
      message.error('Error al cargar detalle del GRC');
    }
  };

  const reloadDetail = async (id) => {
    try {
      const res = await apiClient.get(`/gastos-reserva-comprobar/${id}`);
      setSelectedGrc(res.data);
      fetchGrcs();
      fetchStats();
    } catch (error) {
      console.error(error);
    }
  };

  // Carga de PDFs
  const uploadPdfProps = (type) => ({
    name: 'file',
    showUploadList: false,
    customRequest: async ({ file, onSuccess, onError }) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const endpoint = type === 'request' 
        ? `/gastos-reserva-comprobar/${selectedGrc.id}/upload-request-pdf`
        : `/gastos-reserva-comprobar/${selectedGrc.id}/upload-liquidation-pdf`;

      try {
        const res = await apiClient.post(endpoint, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        onSuccess(res.data);
        message.success('Reporte PDF cargado y parseado correctamente');
        
        if (type === 'request' && res.data.warnings?.length > 0) {
          setPdfWarnings(res.data.warnings);
        } else {
          setPdfWarnings([]);
        }
        
        reloadDetail(selectedGrc.id);
      } catch (err) {
        onError(err);
        message.error(err.response?.data?.detail || 'Error al procesar el PDF');
      }
    }
  });

  const handleClearPdf = async (type) => {
    const endpoint = type === 'request'
      ? `/gastos-reserva-comprobar/${selectedGrc.id}/clear-request-pdf`
      : `/gastos-reserva-comprobar/${selectedGrc.id}/clear-liquidation-pdf`;

    try {
      await apiClient.delete(endpoint);
      message.success('Documento y firmas asociados restablecidos con éxito');
      reloadDetail(selectedGrc.id);
    } catch (err) {
      message.error(err.response?.data?.detail || 'Error al eliminar el documento');
    }
  };

  const parseXmlUuidAndRfc = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(e.target.result, "text/xml");
          const timbre = xmlDoc.getElementsByTagName("tfd:TimbreFiscalDigital")[0]
                      || xmlDoc.getElementsByTagName("TimbreFiscalDigital")[0];
          const uuid = timbre ? timbre.getAttribute("UUID") : null;
          
          const emisor = xmlDoc.getElementsByTagName("cfdi:Emisor")[0]
                      || xmlDoc.getElementsByTagName("Emisor")[0];
          const rfc = emisor ? emisor.getAttribute("Rfc") : null;
          
          resolve({ uuid, rfc });
        } catch (err) {
          resolve({ uuid: null, rfc: null });
        }
      };
      reader.readAsText(file);
    });
  };

  const processUploadedFiles = async (fileList) => {
    const xmlFiles = fileList.filter(f => f.name.toLowerCase().endsWith('.xml'));
    const pdfFiles = fileList.filter(f => f.name.toLowerCase().endsWith('.pdf'));

    const parsedXmls = [];
    for (const xmlFile of xmlFiles) {
      const parsed = await parseXmlUuidAndRfc(xmlFile);
      parsedXmls.push({
        file: xmlFile,
        uuid: parsed.uuid,
        rfc: parsed.rfc,
        baseName: xmlFile.name.substring(0, xmlFile.name.lastIndexOf('.')).toLowerCase()
      });
    }

    const matched = [];
    const usedPdfNames = new Set();

    parsedXmls.forEach((xml, idx) => {
      let matchedPdf = null;
      if (xml.uuid) {
        const cleanUuid = xml.uuid.toLowerCase().replace(/-/g, '').trim();
        matchedPdf = pdfFiles.find(pdf => {
          const cleanPdfName = pdf.name.toLowerCase().replace(/-/g, '').trim();
          return cleanPdfName.includes(cleanUuid);
        });
      }

      if (!matchedPdf) {
        matchedPdf = pdfFiles.find(pdf => {
          const pdfBaseName = pdf.name.substring(0, pdf.name.lastIndexOf('.')).toLowerCase().replace(/[^a-z0-9]/g, '');
          const xmlBaseName = xml.baseName.replace(/[^a-z0-9]/g, '');
          
          if (pdfBaseName === xmlBaseName) return true;
          
          // Coincidencia parcial si tienen más de 4 caracteres
          if (pdfBaseName.length >= 4 && xmlBaseName.includes(pdfBaseName)) return true;
          if (xmlBaseName.length >= 4 && pdfBaseName.includes(xmlBaseName)) return true;
          
          return false;
        });
      }

      if (!matchedPdf) {
        // Fallback inteligente: buscar coincidencia de sufijo de al menos 10 caracteres
        matchedPdf = pdfFiles.find(pdf => {
          const pdfBaseName = pdf.name.substring(0, pdf.name.lastIndexOf('.')).toLowerCase().replace(/[^a-z0-9]/g, '');
          const xmlBaseName = xml.baseName.replace(/[^a-z0-9]/g, '');
          if (pdfBaseName.length >= 10 && xmlBaseName.length >= 10) {
            const suffixPdf = pdfBaseName.substring(pdfBaseName.length - 10);
            const suffixXml = xmlBaseName.substring(xmlBaseName.length - 10);
            return suffixPdf === suffixXml;
          }
          return false;
        });
      }

      if (matchedPdf) {
        usedPdfNames.add(matchedPdf.name);
      }

      const isDuplicate = selectedGrc.facturas?.some(f => f.uuid && xml.uuid && f.uuid.toLowerCase().replace(/-/g, '') === xml.uuid.toLowerCase().replace(/-/g, ''));

      matched.push({
        key: `xml-${idx}`,
        xmlFile: xml.file,
        pdfFile: matchedPdf || null,
        uuid: xml.uuid || 'No encontrado',
        rfc: xml.rfc || 'No encontrado',
        status: isDuplicate ? 'error' : 'pending',
        error: isDuplicate ? 'Esta factura ya está registrada en esta comprobación.' : null
      });
    });

    const orphanPdfs = pdfFiles.filter(pdf => !usedPdfNames.has(pdf.name));
    orphanPdfs.forEach((pdf, idx) => {
      matched.push({
        key: `pdf-orphan-${idx}`,
        xmlFile: null,
        pdfFile: pdf,
        uuid: 'N/A',
        rfc: 'N/A',
        status: 'orphan',
        error: 'Falta archivo XML correspondiente'
      });
    });

    setMatchedInvoices(matched);
    setProcessingFiles(false);
  };

  const handleRemoveMatchedInvoice = (key) => {
    setMatchedInvoices(prev => prev.filter(inv => inv.key !== key));
  };

  const handleFilesUploadChange = (file, fileList) => {
    setProcessingFiles(true);
    processUploadedFiles(fileList);
    return false;
  };

  const handleOpenUploadInvoice = () => {
    setXmlFileList([]);
    setPdfFileList([]);
    setMatchedInvoices([]);
    invoiceForm.resetFields();
    invoiceForm.setFieldsValue({
      category_id: selectedGrc?.category_id || categories[0]?.id,
      description: 'Comprobante de GRC'
    });
    setIsInvoiceModalOpen(true);
  };

  const handleSubmitInvoice = async () => {
    const validInvoices = matchedInvoices.filter(inv => inv.xmlFile && inv.status !== 'success');
    if (validInvoices.length === 0) {
      message.warning('No hay facturas válidas (con XML) para cargar.');
      return;
    }

    const values = await invoiceForm.validateFields();
    setIsUploadingMulti(true);

    let successCount = 0;
    let failCount = 0;
    const updatedInvoices = [...matchedInvoices];

    for (let i = 0; i < updatedInvoices.length; i++) {
      const inv = updatedInvoices[i];
      if (!inv.xmlFile || inv.status === 'success') continue;

      const formData = new FormData();
      formData.append('xml_file', inv.xmlFile);
      if (inv.pdfFile) {
        formData.append('pdf_file', inv.pdfFile);
      }
      if (values.category_id) {
        formData.append('category_id', values.category_id);
      }
      formData.append('description', values.description || '');

      try {
        inv.status = 'uploading';
        setMatchedInvoices([...updatedInvoices]);

        await apiClient.post(`/gastos-reserva-comprobar/${selectedGrc.id}/invoices`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        inv.status = 'success';
        inv.error = null;
        successCount++;
      } catch (err) {
        inv.status = 'error';
        inv.error = err.response?.data?.detail || err.message || 'Error al validar factura';
        failCount++;
      }
      setMatchedInvoices([...updatedInvoices]);
    }

    setIsUploadingMulti(false);
    
    if (successCount > 0) {
      message.success(`${successCount} factura(s) cargada(s) y validada(s) con éxito.`);
      reloadDetail(selectedGrc.id);
    }
    if (failCount > 0) {
      message.error(`${failCount} factura(s) no pudieron ser validadas.`);
    }

    if (failCount === 0 && successCount > 0) {
      setIsInvoiceModalOpen(false);
    }
  };

  const handleDeleteInvoice = async (invId) => {
    try {
      await apiClient.delete(`/gastos-reserva-comprobar/invoices/${invId}`);
      message.success('Comprobante eliminado');
      reloadDetail(selectedGrc.id);
    } catch (error) {
      message.error('Error al eliminar el comprobante');
    }
  };

  const handleUpdateInvoiceCategory = async (invoiceId, categoryId) => {
    try {
      await apiClient.put(`/gastos-reserva-comprobar/invoices/${invoiceId}/category`, { category_id: categoryId });
      message.success('Categoría de factura actualizada');
      reloadDetail(selectedGrc.id);
    } catch (error) {
      message.error(error.response?.data?.detail || 'Error al actualizar la categoría');
    }
  };

  const handleVerifySat = async (invoiceId) => {
    try {
      const res = await apiClient.post(`/gastos-reserva-comprobar/invoices/${invoiceId}/verify-sat`);
      message.success(res.data.message);
      reloadDetail(selectedGrc.id);
    } catch (error) {
      message.error(error.response?.data?.detail || 'Error al conectar con el SAT');
    }
  };

  const handleDownloadInvoicesZip = async (id) => {
    try {
      const response = await apiClient.get(`/gastos-reserva-comprobar/${id}/invoices/zip`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `facturas_grc_${selectedGrc.folio_episa}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      message.error('Error al descargar el archivo ZIP de facturas.');
    }
  };

  const handleUploadReturnReceipt = async () => {
    if (!returnFileList.length) {
      message.error('Debe seleccionar el comprobante de devolución');
      return;
    }
    const formData = new FormData();
    formData.append('file', returnFileList[0]);

    try {
      await apiClient.post(`/gastos-reserva-comprobar/${selectedGrc.id}/upload-return-receipt`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      message.success('Comprobante de devolución guardado y estado actualizado');
      setIsReturnModalOpen(false);
      setReturnFileList([]);
      reloadDetail(selectedGrc.id);
      fetchGrcs(); // actualizar lista principal
    } catch (err) {
      message.error(err.response?.data?.detail || 'Error al subir el comprobante de devolución');
    }
  };

  const handleClearReturnReceipt = async () => {
    try {
      await apiClient.delete(`/gastos-reserva-comprobar/${selectedGrc.id}/clear-return-receipt`);
      message.success('Comprobante de devolución eliminado y estado restablecido');
      reloadDetail(selectedGrc.id);
      fetchGrcs(); // actualizar lista principal
    } catch (err) {
      message.error(err.response?.data?.detail || 'Error al eliminar el comprobante de devolución');
    }
  };

  const columns = [
    {
      title: 'Folio EPISA',
      dataIndex: 'folio_episa',
      key: 'folio_episa',
      render: (val, record) => (
        <span style={{ fontWeight: 600, color: '#1B4F72' }}>
          {val}
        </span>
      )
    },
    {
      title: 'Estado',
      dataIndex: 'status',
      key: 'status',
      render: (val) => {
        const cfg = STATUS_MAP[val] || { label: val, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label.toUpperCase()}</Tag>;
      }
    },
    {
      title: 'Solicitado',
      dataIndex: 'monto_solicitado',
      key: 'monto_solicitado',
      render: (val) => `$ ${val.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
    },
    {
      title: 'Comprobado',
      dataIndex: 'monto_comprobado',
      key: 'monto_comprobado',
      render: (val) => `$ ${val.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
    },
    {
      title: 'Saldo / Dev.',
      key: 'saldo',
      render: (_, record) => {
        if (record.status === 'devolucion_realizada' && record.monto_devuelto > 0) {
          return <span style={{ color: '#2980B9', fontWeight: 500 }}>Devuelto: $ {record.monto_devuelto.toLocaleString()}</span>;
        }
        if (record.monto_devuelto > 0 && record.status === 'comprobado') {
          return <span style={{ color: '#E67E22', fontWeight: 500 }}>Devuelve: $ {record.monto_devuelto.toLocaleString()}</span>;
        }
        if (record.monto_saldo_favor > 0) {
          return <span style={{ color: '#27AE60', fontWeight: 500 }}>A favor: $ {record.monto_saldo_favor.toLocaleString()}</span>;
        }
        return <span style={{ color: '#95A5A6' }}>Conciliado</span>;
      }
    },
    {
      title: 'Fecha Sol.',
      dataIndex: 'fecha_solicitud',
      key: 'fecha_solicitud'
    },
    {
      title: 'Acciones',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button icon={<EyeOutlined />} onClick={() => handleOpenDetail(record)}>Detalles</Button>
          <Button icon={<EditOutlined />} onClick={() => handleOpenEdit(record)}>Editar</Button>
          <Popconfirm
            title="¿Eliminar esta solicitud GRC?"
            description="Esta acción es irreversible y eliminará todos los comprobantes vinculados."
            onConfirm={() => handleDeleteGrc(record.id)}
            okText="Sí, eliminar"
            cancelText="Cancelar"
            okButtonProps={{ danger: true }}
          >
            <Button icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      )
    }
  ];

  // Cálculos financieros para el Dashboard global de GRC
  const totalSolicitado = grcList.reduce((acc, g) => acc + (g.monto_solicitado || 0), 0);
  const totalComprobado = grcList.reduce((acc, g) => acc + (g.monto_comprobado || 0), 0);
  const totalDevuelto = grcList.reduce((acc, g) => acc + (g.monto_devuelto || 0), 0);
  const totalPendiente = grcList.reduce((acc, g) => {
    if (g.status !== 'comprobado') {
      return acc + Math.max(0, (g.monto_solicitado || 0) - (g.monto_comprobado || 0));
    }
    return acc;
  }, 0);

  return (
    <div style={{ padding: '0px' }}>
      {/* HEADER DE GRÁFICOS Y ANALÍTICAS FINANCIERAS */}
      <Card style={{
        background: 'linear-gradient(135deg, #0A2647, #1B4F72)',
        borderRadius: 16,
        marginBottom: 24,
        boxShadow: '0 8px 24px rgba(10,38,71,0.15)',
        color: '#fff'
      }}>
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} sm={12} md={6}>
            <div style={{ padding: '8px' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.8 }}>Total Solicitado</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>
                $ {totalSolicitado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                Histórico acumulado de GRC
              </div>
            </div>
          </Col>
          <Col xs={24} sm={12} md={6} style={{ borderLeft: '1px solid rgba(255,255,255,0.15)' }}>
            <div style={{ padding: '8px' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.8 }}>Total Comprobado</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: '#2ECC71' }}>
                $ {totalComprobado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </div>
              <Progress percent={totalSolicitado > 0 ? Math.round((totalComprobado / totalSolicitado) * 100) : 0} showInfo={false} strokeColor="#2ECC71" size="small" />
            </div>
          </Col>
          <Col xs={24} sm={12} md={6} style={{ borderLeft: '1px solid rgba(255,255,255,0.15)' }}>
            <div style={{ padding: '8px' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.8 }}>Pendiente de Comprobar</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: '#E67E22' }}>
                $ {totalPendiente.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                En solicitudes abiertas
              </div>
            </div>
          </Col>
          <Col xs={24} sm={12} md={6} style={{ borderLeft: '1px solid rgba(255,255,255,0.15)' }}>
            <div style={{ padding: '8px' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.8 }}>Reintegros / Devoluciones</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: '#3498DB' }}>
                $ {totalDevuelto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                Dinero devuelto a cuentas
              </div>
            </div>
          </Col>
        </Row>
      </Card>

      {/* CONTENIDO PRINCIPAL */}
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span style={{ color: '#0A2647', fontWeight: 600, fontSize: 18 }}>Control de Anticipos (GRC)</span>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenCreate}
              style={{
                background: 'linear-gradient(135deg, #1B4F72, #2C74B3)',
                border: 'none',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(27,79,114,0.3)',
                height: 38
              }}
            >
              Registrar un GRC
            </Button>
          </div>
        }
        style={{ borderRadius: 16, boxShadow: '0 4px 16px rgba(0,0,0,0.05)' }}
      >
        <Table
          columns={columns}
          dataSource={grcList}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 15 }}
        />
      </Card>

      {/* MODAL EDITAR / CREAR */}
      <Modal
        title={<span style={{ color: '#0A2647', fontWeight: 600 }}>{editingGrc ? 'Editar Solicitud GRC' : 'Nueva Solicitud GRC'}</span>}
        open={isFormOpen}
        onOk={handleSaveGrc}
        onCancel={() => setIsFormOpen(false)}
        okText="Guardar"
        cancelText="Cancelar"
        width={700}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {/* Zona de parser PDF al crear */}
          {!editingGrc && (
            <div style={{ marginBottom: 20 }}>
              <Alert
                message="Autocompletar con PDF Oficial (Opcional)"
                description="Arrastra la Solicitud de GRC oficial de CICESE para extraer el folio, solicitante, montos, cuenta contable, justificación, firmas y conceptos de forma automática."
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
              />
              <Spin spinning={parsingPdf} tip="Analizando PDF de solicitud y firmas...">
                <Dragger
                  accept=".pdf"
                  multiple={false}
                  beforeUpload={handlePdfParse}
                  showUploadList={false}
                >
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined style={{ color: '#1B4F72' }} />
                  </p>
                  <p className="ant-upload-text">Haz clic o arrastra el PDF de la solicitud aquí</p>
                  <p className="ant-upload-hint">Soporta reportes oficiales de Solicitud de GRC firmados electrónicamente</p>
                </Dragger>
              </Spin>
            </div>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="folio_episa"
                label="Folio EPISA"
                rules={[{ required: true, message: 'El Folio EPISA es requerido' }]}
              >
                <Input placeholder="Ej. 105537" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="monto_solicitado"
                label="Monto Solicitado"
                rules={[{ required: true, message: 'El importe solicitado es requerido' }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  formatter={(val) => `$ ${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(val) => val.replace(/\$\s?|(,*)/g, '')}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="account_id" label="Cuenta de Egreso">
                <Select placeholder="Selecciona la cuenta origen">
                  {accounts.map(a => (
                    <Select.Option key={a.id} value={a.id}>
                      {a.name} ({a.account_number})
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="category_id" label="Categoría de Gasto Principal">
                <Select placeholder="Selecciona categoría">
                  {categories.map(c => (
                    <Select.Option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="fecha_pago_servicio" label="Fecha Límite / Pago del Servicio">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="solicitante_id"
                label="Solicitante / Beneficiario"
                rules={[{ required: true, message: 'Selecciona al solicitante' }]}
              >
                <Select placeholder="Seleccionar solicitante" showSearch optionFilterProp="children">
                  {users.map(u => (
                    <Select.Option key={u.id} value={u.id}>
                      {u.full_name || u.username} (@{u.username})
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="asistente_id" label="Asistente de Comprobación (Opcional)">
                <Select placeholder="Selecciona un asistente" allowClear>
                  {users.map(u => (
                    <Select.Option key={u.id} value={u.id}>
                      {u.full_name || u.username} (@{u.username})
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="justificacion"
            label="Justificación del Gasto"
            rules={[{ required: true, message: 'Ingresa la justificación de la reserva' }]}
          >
            <TextArea rows={3} placeholder="Describa el motivo por el cual no se cuenta con crédito o se realiza en anticipo..." />
          </Form.Item>

          <Form.Item name="observaciones" label="Observaciones">
            <TextArea rows={2} placeholder="Comentarios adicionales" />
          </Form.Item>

          {editingGrc && (
            <Form.Item name="status" label="Estado de la Solicitud (Control Manual)">
              <Select>
                {Object.entries(STATUS_MAP).map(([key, cfg]) => (
                  <Select.Option key={key} value={key}>
                    {cfg.label.toUpperCase()}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}

          {tempItems.length > 0 && (
            <div style={{ marginTop: 20, marginBottom: 20 }}>
              <span style={{ color: '#0A2647', fontWeight: 600, display: 'block', marginBottom: 8 }}>
                Partidas/Conceptos Extraídos del PDF ({tempItems.length})
              </span>
              <Table
                size="small"
                dataSource={tempItems}
                pagination={false}
                rowKey={(record, idx) => idx}
                columns={[
                  { title: 'Concepto', dataIndex: 'concepto', key: 'concepto' },
                  { title: 'Partida', dataIndex: 'partida', key: 'partida', width: 100 },
                  { title: 'CUCOP', dataIndex: 'cucop', key: 'cucop' },
                  {
                    title: 'Subtotal',
                    dataIndex: 'subtotal',
                    key: 'subtotal',
                    width: 120,
                    render: (val) => `$ ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  }
                ]}
              />
            </div>
          )}
        </Form>
      </Modal>

      {/* MODAL DETALLES & COMPROBACIÓN */}
      <Modal
        title={
          <Space>
            <span style={{ color: '#0A2647', fontWeight: 600 }}>GRC Folio: {selectedGrc?.folio_episa}</span>
            <Tag color={STATUS_MAP[selectedGrc?.status]?.color}>
              {STATUS_MAP[selectedGrc?.status]?.label.toUpperCase()}
            </Tag>
          </Space>
        }
        open={isDetailOpen}
        onCancel={() => setIsDetailOpen(false)}
        footer={[
          <Button key="close" onClick={() => setIsDetailOpen(false)}>Cerrar</Button>
        ]}
        width={1100}
        destroyOnClose
      >
        {selectedGrc && (
          <div>
            <Tabs activeKey={detailTab} onChange={setDetailTab} style={{ marginTop: 8 }}>
              {/* PESTAÑA: SEGUIMIENTO DE FIRMAS Y DURACIONES */}
              <TabPane tab={<span><ClockCircleOutlined /> Firmas y Tiempos</span>} key="signatures">
                <Row gutter={[24, 24]}>
                  <Col span={14}>
                    <h3 style={{ color: '#1B4F72', marginBottom: 16 }}>Flujo de Firmas y Tiempos de Auditoría</h3>
                    <Timeline mode="left">
                      <Timeline.Item dot={<CheckCircleOutlined style={{ fontSize: '16px', color: '#27AE60' }} />} color="green">
                        <div>
                          <strong>Solicitante</strong>: {selectedGrc.firma_solicitante_nombre || selectedGrc.solicitante?.full_name || 'Pendiente'}
                          {selectedGrc.firma_solicitante_fecha && (
                            <div style={{ fontSize: 11, color: '#7F8C8D' }}>
                              Firmado el {dayjs(selectedGrc.firma_solicitante_fecha).format('DD-MM-YYYY HH:mm:ss')}
                            </div>
                          )}
                        </div>
                      </Timeline.Item>
                      
                      <Timeline.Item
                        dot={selectedGrc.firma_revisor_fecha ? <CheckCircleOutlined style={{ fontSize: '16px', color: '#27AE60' }} /> : <ClockCircleOutlined />}
                        color={selectedGrc.firma_revisor_fecha ? 'green' : 'gray'}
                      >
                        <div>
                          <strong>Revisor Administrativo</strong>: {selectedGrc.firma_revisor_nombre || 'En espera'}
                          {selectedGrc.firma_revisor_fecha && (
                            <div style={{ fontSize: 11, color: '#7F8C8D' }}>
                              Firmado el {dayjs(selectedGrc.firma_revisor_fecha).format('DD-MM-YYYY HH:mm:ss')}
                              {selectedGrc.tiempo_revisor_horas !== null && ` (Tardó: ${selectedGrc.tiempo_revisor_horas} hrs)`}
                            </div>
                          )}
                        </div>
                      </Timeline.Item>

                      <Timeline.Item
                        dot={selectedGrc.firma_director_fecha ? <CheckCircleOutlined style={{ fontSize: '16px', color: '#27AE60' }} /> : <ClockCircleOutlined />}
                        color={selectedGrc.firma_director_fecha ? 'green' : 'gray'}
                      >
                        <div>
                          <strong>Director Administrativo</strong>: {selectedGrc.firma_director_nombre || 'En espera'}
                          {selectedGrc.firma_director_fecha && (
                            <div style={{ fontSize: 11, color: '#7F8C8D' }}>
                              Firmado el {dayjs(selectedGrc.firma_director_fecha).format('DD-MM-YYYY HH:mm:ss')}
                              {selectedGrc.tiempo_director_horas !== null && ` (Tardó: ${selectedGrc.tiempo_director_horas} hrs)`}
                            </div>
                          )}
                        </div>
                      </Timeline.Item>

                      <Timeline.Item
                        dot={selectedGrc.firma_tesoreria_fecha ? <CheckCircleOutlined style={{ fontSize: '16px', color: '#27AE60' }} /> : <ClockCircleOutlined />}
                        color={selectedGrc.firma_tesoreria_fecha ? 'green' : 'gray'}
                      >
                        <div>
                          <strong>Depósito / Tesorería</strong>: {selectedGrc.firma_tesoreria_nombre || 'En espera'}
                          {selectedGrc.firma_tesoreria_fecha && (
                            <div style={{ fontSize: 11, color: '#7F8C8D' }}>
                              Depositado el {dayjs(selectedGrc.firma_tesoreria_fecha).format('DD-MM-YYYY HH:mm:ss')}
                              {selectedGrc.tiempo_tesoreria_horas !== null && ` (Tardó: ${selectedGrc.tiempo_tesoreria_horas} hrs)`}
                            </div>
                          )}
                        </div>
                      </Timeline.Item>

                      <Timeline.Item
                        dot={selectedGrc.firma_contabilidad_fecha ? <CheckCircleOutlined style={{ fontSize: '16px', color: '#27AE60' }} /> : <ClockCircleOutlined />}
                        color={selectedGrc.firma_contabilidad_fecha ? 'green' : 'gray'}
                      >
                        <div>
                          <strong>Liquidación (Contabilidad)</strong>: {selectedGrc.firma_contabilidad_nombre || 'En espera'}
                          {selectedGrc.firma_contabilidad_fecha && (
                            <div style={{ fontSize: 11, color: '#7F8C8D' }}>
                              Comprobado el {dayjs(selectedGrc.firma_contabilidad_fecha).format('DD-MM-YYYY HH:mm:ss')}
                              {selectedGrc.tiempo_contabilidad_horas !== null && ` (Tardó: ${selectedGrc.tiempo_contabilidad_horas} hrs)`}
                            </div>
                          )}
                        </div>
                      </Timeline.Item>
                    </Timeline>
                  </Col>
                  
                  <Col span={10} style={{ background: '#F8F9FA', borderRadius: 8, padding: 16 }}>
                    <h4 style={{ color: '#0A2647', marginBottom: 12 }}>Resumen del Proceso GRC</h4>
                    <Row gutter={[16, 16]}>
                      <Col span={12}><Statistic title="Monto Solicitado" value={selectedGrc.monto_solicitado} precision={2} prefix="$" valueStyle={{ fontSize: 16 }} /></Col>
                      <Col span={12}><Statistic title="Monto Comprobado" value={selectedGrc.monto_comprobado} precision={2} prefix="$" valueStyle={{ fontSize: 16 }} /></Col>
                      <Col span={24}>
                        <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 12, marginTop: 8 }}>
                          <strong>Tiempo Total de Gestión: </strong>
                          <span style={{ fontSize: 16, color: '#2ECC71', fontWeight: 600 }}>
                            {selectedGrc.tiempo_total_dias !== null ? `${selectedGrc.tiempo_total_dias} días` : 'Pendiente de liquidación'}
                          </span>
                        </div>
                      </Col>

                      {selectedGrc.status === 'comprobado' && selectedGrc.monto_devuelto > 0 && (
                        <Col span={24}>
                          <div style={{ background: '#FFF3CD', border: '1px solid #FFEBAA', borderRadius: 8, padding: 12, marginTop: 8 }}>
                            <div style={{ color: '#856404', fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
                              Pendiente de Devolución: $ {selectedGrc.monto_devuelto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                            </div>
                            <Button 
                              type="primary" 
                              danger 
                              icon={<UploadOutlined />} 
                              size="small"
                              onClick={() => setIsReturnModalOpen(true)}
                            >
                              Registrar Comprobante de Devolución
                            </Button>
                          </div>
                        </Col>
                      )}

                      {selectedGrc.status === 'devolucion_realizada' && (
                        <Col span={24}>
                          <div style={{ background: '#D4EDDA', border: '1px solid #C3E6CB', borderRadius: 8, padding: 12, marginTop: 8 }}>
                            <div style={{ color: '#155724', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>
                              Devolución Realizada: $ {selectedGrc.monto_devuelto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                            </div>
                            {selectedGrc.comprobante_devolucion_path && (
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                                <a href={getFileUrl(selectedGrc.comprobante_devolucion_path)} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 500 }}>
                                  Ver Comprobante de Pago
                                </a>
                                <Popconfirm
                                  title="¿Eliminar comprobante de devolución?"
                                  description="El trámite regresará al estado de comprobado."
                                  onConfirm={handleClearReturnReceipt}
                                  okText="Sí, eliminar"
                                  cancelText="No"
                                  okButtonProps={{ danger: true }}
                                >
                                  <Button icon={<DeleteOutlined />} size="small" type="text" danger />
                                </Popconfirm>
                              </div>
                            )}
                          </div>
                        </Col>
                      )}
                    </Row>
                  </Col>
                </Row>

                {/* LÍNEA DE TIEMPO HORIZONTAL ACUMULADA */}
                <div style={{ marginTop: 32, borderTop: '1px solid #E2E8F0', paddingTop: 24 }}>
                  <h4 style={{ color: '#0A2647', marginBottom: 24, textAlign: 'center', fontWeight: 600, letterSpacing: '0.5px' }}>
                    Línea de Tiempo Acumulada del Proceso (Desde el Inicio)
                  </h4>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', padding: '0 24px', minHeight: '90px' }}>
                    {/* Línea de fondo */}
                    <div style={{
                      position: 'absolute',
                      top: '20px',
                      left: '50px',
                      right: '50px',
                      height: '4px',
                      background: '#E2E8F0',
                      zIndex: 1
                    }} />
                    
                    {/* Etapa 1: Solicitud */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2, width: '18%' }}>
                      <Tooltip title={selectedGrc.firma_solicitante_fecha ? `Firmado: ${dayjs(selectedGrc.firma_solicitante_fecha).format('DD-MM-YYYY HH:mm:ss')}` : 'Sin fecha'}>
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          background: '#27AE60',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold',
                          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                          fontSize: '16px',
                          cursor: 'pointer'
                        }}>
                          <CheckOutlined />
                        </div>
                      </Tooltip>
                      <div style={{ marginTop: 8, fontWeight: 600, fontSize: 12, textAlign: 'center', color: '#2C3E50' }}>Solicitud</div>
                      <div style={{ fontSize: 11, color: '#27AE60', marginTop: 2, fontWeight: 500 }}>Día 0 (Inicio)</div>
                    </div>

                    {/* Etapa 2: Revisión */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2, width: '18%' }}>
                      <Tooltip title={selectedGrc.firma_revisor_fecha ? `Firmado: ${dayjs(selectedGrc.firma_revisor_fecha).format('DD-MM-YYYY HH:mm:ss')}` : 'En espera'}>
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          background: selectedGrc.firma_revisor_fecha ? '#27AE60' : '#BDC3C7',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold',
                          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                          fontSize: '16px',
                          cursor: selectedGrc.firma_revisor_fecha ? 'pointer' : 'default'
                        }}>
                          {selectedGrc.firma_revisor_fecha ? <CheckOutlined /> : '2'}
                        </div>
                      </Tooltip>
                      <div style={{ marginTop: 8, fontWeight: 600, fontSize: 12, textAlign: 'center', color: '#2C3E50' }}>Revisión</div>
                      <div style={{ fontSize: 11, color: selectedGrc.firma_revisor_fecha ? '#27AE60' : '#7F8C8D', marginTop: 2, fontWeight: selectedGrc.firma_revisor_fecha ? 500 : 400 }}>
                        {selectedGrc.firma_revisor_fecha ? `+ ${getElapsedTime(selectedGrc.firma_revisor_fecha)}` : 'En espera'}
                      </div>
                    </div>

                    {/* Etapa 3: Aprobación */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2, width: '18%' }}>
                      <Tooltip title={selectedGrc.firma_director_fecha ? `Firmado: ${dayjs(selectedGrc.firma_director_fecha).format('DD-MM-YYYY HH:mm:ss')}` : 'En espera'}>
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          background: selectedGrc.firma_director_fecha ? '#27AE60' : '#BDC3C7',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold',
                          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                          fontSize: '16px',
                          cursor: selectedGrc.firma_director_fecha ? 'pointer' : 'default'
                        }}>
                          {selectedGrc.firma_director_fecha ? <CheckOutlined /> : '3'}
                        </div>
                      </Tooltip>
                      <div style={{ marginTop: 8, fontWeight: 600, fontSize: 12, textAlign: 'center', color: '#2C3E50' }}>Aprobación</div>
                      <div style={{ fontSize: 11, color: selectedGrc.firma_director_fecha ? '#27AE60' : '#7F8C8D', marginTop: 2, fontWeight: selectedGrc.firma_director_fecha ? 500 : 400 }}>
                        {selectedGrc.firma_director_fecha ? `+ ${getElapsedTime(selectedGrc.firma_director_fecha)}` : 'En espera'}
                      </div>
                    </div>

                    {/* Etapa 4: Depósito */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2, width: '18%' }}>
                      <Tooltip title={selectedGrc.firma_tesoreria_fecha ? `Depositado: ${dayjs(selectedGrc.firma_tesoreria_fecha).format('DD-MM-YYYY HH:mm:ss')}` : 'En espera'}>
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          background: selectedGrc.firma_tesoreria_fecha ? '#27AE60' : '#BDC3C7',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold',
                          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                          fontSize: '16px',
                          cursor: selectedGrc.firma_tesoreria_fecha ? 'pointer' : 'default'
                        }}>
                          {selectedGrc.firma_tesoreria_fecha ? <CheckOutlined /> : '4'}
                        </div>
                      </Tooltip>
                      <div style={{ marginTop: 8, fontWeight: 600, fontSize: 12, textAlign: 'center', color: '#2C3E50' }}>Depósito</div>
                      <div style={{ fontSize: 11, color: selectedGrc.firma_tesoreria_fecha ? '#27AE60' : '#7F8C8D', marginTop: 2, fontWeight: selectedGrc.firma_tesoreria_fecha ? 500 : 400 }}>
                        {selectedGrc.firma_tesoreria_fecha ? `+ ${getElapsedTime(selectedGrc.firma_tesoreria_fecha)}` : 'En espera'}
                      </div>
                    </div>

                    {/* Etapa 5: Liquidación */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2, width: '18%' }}>
                      <Tooltip title={selectedGrc.firma_contabilidad_fecha ? `Comprobado: ${dayjs(selectedGrc.firma_contabilidad_fecha).format('DD-MM-YYYY HH:mm:ss')}` : 'En espera'}>
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          background: selectedGrc.firma_contabilidad_fecha ? '#27AE60' : '#BDC3C7',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold',
                          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                          fontSize: '16px',
                          cursor: selectedGrc.firma_contabilidad_fecha ? 'pointer' : 'default'
                        }}>
                          {selectedGrc.firma_contabilidad_fecha ? <CheckOutlined /> : '5'}
                        </div>
                      </Tooltip>
                      <div style={{ marginTop: 8, fontWeight: 600, fontSize: 12, textAlign: 'center', color: '#2C3E50' }}>Liquidación</div>
                      <div style={{ fontSize: 11, color: selectedGrc.firma_contabilidad_fecha ? '#27AE60' : '#7F8C8D', marginTop: 2, fontWeight: selectedGrc.firma_contabilidad_fecha ? 500 : 400 }}>
                        {selectedGrc.firma_contabilidad_fecha ? `+ ${getElapsedTime(selectedGrc.firma_contabilidad_fecha)}` : 'En espera'}
                      </div>
                    </div>
                  </div>
                </div>
              </TabPane>

              {/* PESTAÑA: SUBIDA Y CONTRASTE DE REPORTES PDF */}
              <TabPane tab={<span><FilePdfOutlined /> Cargar Reporte PDF</span>} key="pdf_reports">
                <Alert
                  message="Procesamiento Inteligente de PDF"
                  description="Suba el reporte oficial descargado del sistema de la DEO. El sistema contrastará el Folio, montos y cuenta contra lo capturado, además de registrar las firmas y marcas de tiempo automáticamente."
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                />

                {pdfWarnings.length > 0 && (
                  <Alert
                    message="Advertencia de Contraste / Discrepancia de Datos"
                    description={
                      <ul>
                        {pdfWarnings.map((w, idx) => <li key={idx}>{w}</li>)}
                      </ul>
                    }
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                  />
                )}

                <Row gutter={[16, 16]}>
                  <Col span={12}>
                    <Card title="1. Reporte de Solicitud (GARC)" size="small">
                      {selectedGrc.solicitud_pdf_path ? (
                        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Tag color="green">CARGADO</Tag>
                          <a href={getFileUrl(selectedGrc.solicitud_pdf_path)} target="_blank" rel="noreferrer">
                            Ver Documento de Solicitud
                          </a>
                          <Popconfirm
                            title="¿Eliminar PDF de solicitud?"
                            description="Se restablecerán las firmas y tiempos asociados a esta solicitud."
                            onConfirm={() => handleClearPdf('request')}
                            okText="Sí, eliminar"
                            cancelText="No"
                            okButtonProps={{ danger: true }}
                          >
                            <Button icon={<DeleteOutlined />} size="small" type="text" danger />
                          </Popconfirm>
                        </div>
                      ) : (
                        <Tag color="orange" style={{ marginBottom: 12 }}>PENDIENTE</Tag>
                      )}
                      <Upload {...uploadPdfProps('request')}>
                        <Button icon={<UploadOutlined />} type="primary">Cargar Solicitud PDF</Button>
                      </Upload>
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card title="2. Reporte de Liquidación (LGARC)" size="small">
                      {selectedGrc.comprobacion_pdf_path ? (
                        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Tag color="green">CARGADO</Tag>
                          <a href={getFileUrl(selectedGrc.comprobacion_pdf_path)} target="_blank" rel="noreferrer">
                            Ver Documento de Liquidación
                          </a>
                          <Popconfirm
                            title="¿Eliminar PDF de liquidación?"
                            description="Se restablecerán las firmas y tiempos asociados a esta liquidación."
                            onConfirm={() => handleClearPdf('liquidation')}
                            okText="Sí, eliminar"
                            cancelText="No"
                            okButtonProps={{ danger: true }}
                          >
                            <Button icon={<DeleteOutlined />} size="small" type="text" danger />
                          </Popconfirm>
                        </div>
                      ) : (
                        <Tag color="orange" style={{ marginBottom: 12 }}>PENDIENTE</Tag>
                      )}
                      <Upload {...uploadPdfProps('liquidation')}>
                        <Button icon={<UploadOutlined />} type="primary">Cargar Liquidación PDF</Button>
                      </Upload>
                    </Card>
                  </Col>
                </Row>
              </TabPane>

              {/* PESTAÑA: DETALLE DE COMPROBACIONES (INVOICES CFDI) */}
              <TabPane tab={<span><DollarOutlined /> Facturas de Comprobación</span>} key="invoices">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <strong>Total Comprobado: </strong>
                    <span style={{ fontSize: 18, color: '#27AE60', fontWeight: 600 }}>
                      $ {selectedGrc.monto_comprobado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </span>
                    <span style={{ marginLeft: 16 }}>
                      {selectedGrc.monto_devuelto > 0 && `(Usuario devuelve: $${selectedGrc.monto_devuelto.toLocaleString()})`}
                      {selectedGrc.monto_saldo_favor > 0 && `(A favor del usuario: $${selectedGrc.monto_saldo_favor.toLocaleString()})`}
                    </span>
                  </div>
                  
                  <Space>
                    {selectedGrc.facturas && selectedGrc.facturas.length > 0 && (
                      <Button
                        icon={<FileZipOutlined style={{ color: '#E67E22' }} />}
                        onClick={() => handleDownloadInvoicesZip(selectedGrc.id)}
                      >
                        Descargar Facturas (ZIP)
                      </Button>
                    )}
                    <Button icon={<PlusOutlined />} type="primary" onClick={handleOpenUploadInvoice}>
                      Cargar Factura XML / PDF
                    </Button>
                  </Space>
                </div>

                <Table
                  dataSource={selectedGrc.facturas}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 5 }}
                  columns={[
                    {
                      title: 'Emisor',
                      dataIndex: 'emisor_nombre',
                      key: 'emisor_nombre',
                      render: (val, record) => (
                        <div>
                          <strong>{val}</strong>
                          <div style={{ fontSize: 10, color: '#7F8C8D' }}>{record.emisor_rfc}</div>
                        </div>
                      )
                    },
                    {
                      title: 'Folio',
                      dataIndex: 'folio',
                      key: 'folio',
                      render: (val, record) => `${record.serie || ''} ${val || ''}`.trim() || 'S/F'
                    },
                    {
                      title: 'Categoría',
                      dataIndex: 'category_id',
                      key: 'category_id',
                      width: 180,
                      render: (catId, record) => (
                        <Select
                          value={catId}
                          size="small"
                          style={{ width: '100%' }}
                          onChange={(newCatId) => handleUpdateInvoiceCategory(record.id, newCatId)}
                        >
                          {categories.map(c => (
                            <Select.Option key={c.id} value={c.id}>
                              {c.icon} {c.name}
                            </Select.Option>
                          ))}
                        </Select>
                      )
                    },
                    {
                      title: 'Total',
                      dataIndex: 'total',
                      key: 'total',
                      render: (val) => `$ ${val.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
                    },
                    {
                      title: 'Estado SAT',
                      dataIndex: 'sat_status',
                      key: 'sat_status',
                      width: 140,
                      render: (status, record) => {
                        let color = 'default';
                        let label = status || 'No Verificado';
                        if (status === 'Vigente') color = 'green';
                        else if (status === 'Cancelado') color = 'red';
                        else if (status === 'Desconocido' || status === 'Error de Conexión') color = 'warning';
                        
                        return (
                          <Tooltip title={record.sat_verified_at ? `Verificado el: ${dayjs(record.sat_verified_at).format('DD-MM-YYYY HH:mm')}` : 'Sin verificación reciente'}>
                            <Tag color={color}>{label.toUpperCase()}</Tag>
                          </Tooltip>
                        );
                      }
                    },
                    {
                      title: 'Fecha Emisión',
                      dataIndex: 'fecha_emision',
                      key: 'fecha_emision',
                      render: (val) => val ? dayjs(val).format('DD-MM-YYYY') : 'N/A'
                    },
                    {
                      title: 'Acciones',
                      key: 'actions',
                      render: (_, record) => (
                        <Space>
                          {record.pdf_filename && (
                            <a href={getFileUrl(record.pdf_filename)} target="_blank" rel="noreferrer">
                              <Button icon={<EyeOutlined />} size="small">PDF</Button>
                            </a>
                          )}
                          {record.uuid && (
                            <Button
                              icon={<SyncOutlined />}
                              size="small"
                              onClick={() => handleVerifySat(record.id)}
                              title="Verificar ante el SAT"
                            />
                          )}
                          <Popconfirm
                            title="¿Eliminar factura?"
                            onConfirm={() => handleDeleteInvoice(record.id)}
                            okText="Sí"
                            cancelText="No"
                          >
                            <Button icon={<DeleteOutlined />} size="small" danger />
                          </Popconfirm>
                        </Space>
                      )
                    }
                  ]}
                />
              </TabPane>

              {/* PESTAÑA: CONCEPTOS / PARTIDAS */}
              <TabPane tab={<span><DollarOutlined /> Conceptos / Partidas</span>} key="items">
                <Table
                  dataSource={selectedGrc.items || []}
                  pagination={false}
                  rowKey="id"
                  size="small"
                  columns={[
                    { title: 'Concepto', dataIndex: 'concepto', key: 'concepto' },
                    { title: 'Partida', dataIndex: 'partida', key: 'partida', width: 100 },
                    { title: 'CUCOP', dataIndex: 'cucop', key: 'cucop' },
                    { title: 'Rubro CONACYT', dataIndex: 'rubro_conacyt', key: 'rubro_conacyt', width: 120 },
                    {
                      title: 'Subtotal',
                      dataIndex: 'subtotal',
                      key: 'subtotal',
                      width: 120,
                      render: (val) => `$ ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    }
                  ]}
                />
              </TabPane>

              {/* PESTAÑA: HASHES DE FIRMAS */}
              <TabPane tab={<span><CheckOutlined /> Hashes de Firmas</span>} key="signature_hashes">
                <Card size="small" title="Historial Criptográfico de Firmas (Auditoría)">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {[
                      { label: 'Solicitante / Encargado de Cuenta', nombre: selectedGrc.firma_solicitante_nombre, fecha: selectedGrc.firma_solicitante_fecha, hash: selectedGrc.firma_solicitante_hash },
                      { label: 'Revisor Administrativo', nombre: selectedGrc.firma_revisor_nombre, fecha: selectedGrc.firma_revisor_fecha, hash: selectedGrc.firma_revisor_hash },
                      { label: 'Jefe Inmediato', nombre: selectedGrc.firma_jefe_nombre, fecha: selectedGrc.firma_jefe_fecha, hash: selectedGrc.firma_jefe_hash },
                      { label: 'Departamento de Adquisiciones', nombre: selectedGrc.firma_adquisiciones_nombre, fecha: selectedGrc.firma_adquisiciones_fecha, hash: selectedGrc.firma_adquisiciones_hash },
                      { label: 'Director Administrativo', nombre: selectedGrc.firma_director_nombre, fecha: selectedGrc.firma_director_fecha, hash: selectedGrc.firma_director_hash },
                      { label: 'Ventanilla Tesorería', nombre: selectedGrc.firma_tesoreria_nombre, fecha: selectedGrc.firma_tesoreria_fecha, hash: selectedGrc.firma_tesoreria_hash },
                      { label: 'Contabilidad (Liquidación)', nombre: selectedGrc.firma_contabilidad_nombre, fecha: selectedGrc.firma_contabilidad_fecha, hash: selectedGrc.firma_contabilidad_hash },
                    ].map((sig, idx) => (
                      <div key={idx} style={{ paddingBottom: 12, borderBottom: idx < 6 ? '1px solid #E2E8F0' : 'none' }}>
                        <div style={{ fontWeight: 600, color: '#1B4F72', fontSize: 13 }}>{sig.label}</div>
                        {sig.nombre ? (
                          <div style={{ marginTop: 4 }}>
                            <div style={{ fontSize: 12 }}>
                              <strong>Firmante:</strong> {sig.nombre} | <strong>Fecha:</strong> {dayjs(sig.fecha).format('DD-MM-YYYY HH:mm:ss')}
                            </div>
                            {sig.hash ? (
                              <div style={{ background: '#F8F9FA', padding: '6px 10px', borderRadius: 4, fontFamily: 'monospace', fontSize: 10, wordBreak: 'break-all', marginTop: 4, color: '#555', border: '1px solid #E2E8F0' }}>
                                {sig.hash}
                              </div>
                            ) : (
                              <div style={{ fontSize: 11, color: '#7F8C8D', fontStyle: 'italic', marginTop: 2 }}>Sin hash capturado</div>
                            )}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: '#7F8C8D', fontStyle: 'italic', marginTop: 2 }}>Firma pendiente</div>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              </TabPane>
            </Tabs>
          </div>
        )}
      </Modal>

      {/* MODAL DE CARGA DE FACTURAS XML/PDF */}
      <Modal
        title={<span style={{ color: '#0A2647', fontWeight: 600 }}>Cargar Factura XML / PDF (Comprobación)</span>}
        open={isInvoiceModalOpen}
        onOk={handleSubmitInvoice}
        onCancel={() => setIsInvoiceModalOpen(false)}
        okText="Subir y Validar"
        cancelText="Cancelar"
        destroyOnClose
        width={900}
        confirmLoading={isUploadingMulti}
      >
        <Form form={invoiceForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="category_id"
            label="Categoría de Gasto"
            rules={[{ required: false }]}
          >
            <Select placeholder="Selecciona la categoría">
              {categories.map(c => (
                <Select.Option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="description" label="Descripción / Observación Genérica">
            <Input placeholder="Ej. Compra de refacciones..." />
          </Form.Item>

          <Form.Item label="Subir Archivos XML y PDF (Arrastra varios archivos aquí)" required>
            <Spin spinning={processingFiles} tip="Procesando y agrupando archivos...">
              <Upload.Dragger
                accept=".xml,.pdf"
                multiple={true}
                showUploadList={false}
                beforeUpload={handleFilesUploadChange}
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined style={{ color: '#1B4F72' }} />
                </p>
                <p className="ant-upload-text">Haz clic o arrastra múltiples archivos XML y PDF aquí</p>
                <p className="ant-upload-hint">El sistema agrupará automáticamente cada XML con su PDF correspondiente mediante el Folio Fiscal (UUID) o nombre de archivo.</p>
              </Upload.Dragger>
            </Spin>
          </Form.Item>

          {matchedInvoices.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <span style={{ color: '#0A2647', fontWeight: 600, display: 'block', marginBottom: 12 }}>
                Facturas Detectadas ({matchedInvoices.length})
              </span>
              <Table
                size="small"
                dataSource={matchedInvoices}
                pagination={false}
                scroll={{ x: 'max-content' }}
                columns={[
                  {
                    title: 'Factura XML',
                    dataIndex: 'xmlFile',
                    key: 'xmlFile',
                    width: 250,
                    render: (file, record) => (
                      <div style={{ maxWidth: 240 }}>
                        {file ? (
                          <Tooltip title={file.name}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 'bold' }}>
                              {file.name}
                            </div>
                            <div style={{ fontSize: 10, color: '#7F8C8D' }}>RFC: {record.rfc} | UUID: {record.uuid.substring(0, 8)}...</div>
                          </Tooltip>
                        ) : (
                          <span style={{ color: '#E74C3C', fontWeight: 500 }}>Falta XML</span>
                        )}
                      </div>
                    )
                  },
                  {
                    title: 'Archivo PDF',
                    dataIndex: 'pdfFile',
                    key: 'pdfFile',
                    width: 240,
                    render: (file, record) => {
                      if (record.xmlFile === null) {
                        return (
                          <div style={{ maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#F39C12', fontWeight: 500 }}>
                            ✓ {file.name}
                          </div>
                        );
                      }

                      if (file) {
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 230 }}>
                            <Tooltip title={file.name}>
                              <span style={{ color: '#27AE60', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 4 }}>
                                ✓ {file.name}
                              </span>
                            </Tooltip>
                            <Button
                              type="text"
                              size="small"
                              icon={<CloseOutlined style={{ fontSize: 10, color: '#999' }} />}
                              onClick={() => {
                                const updated = matchedInvoices.map(item =>
                                  item.key === record.key ? { ...item, pdfFile: null } : item
                                );
                                updated.push({
                                  key: `pdf-orphan-${Date.now()}`,
                                  xmlFile: null,
                                  pdfFile: file,
                                  uuid: 'N/A',
                                  rfc: 'N/A',
                                  status: 'orphan',
                                  error: 'Falta archivo XML correspondiente'
                                });
                                setMatchedInvoices(updated);
                              }}
                            />
                          </div>
                        );
                      }

                      const orphans = matchedInvoices.filter(inv => inv.xmlFile === null);
                      if (orphans.length > 0) {
                        return (
                          <Select
                            placeholder="Vincular PDF..."
                            size="small"
                            style={{ width: '100%' }}
                            value={undefined}
                            onChange={(orphanKey) => {
                              const orphan = matchedInvoices.find(item => item.key === orphanKey);
                              if (!orphan) return;
                              const updated = matchedInvoices
                                .map(item => item.key === record.key ? { ...item, pdfFile: orphan.pdfFile } : item)
                                .filter(item => item.key !== orphanKey);
                              setMatchedInvoices(updated);
                            }}
                          >
                            {orphans.map(o => (
                              <Select.Option key={o.key} value={o.key}>
                                {o.pdfFile.name}
                              </Select.Option>
                            ))}
                          </Select>
                        );
                      }

                      return (
                        <span style={{ color: '#F39C12', fontWeight: 500 }}>⚠️ Sin PDF (Sólo XML)</span>
                      );
                    }
                  },
                  {
                    title: 'Estado',
                    dataIndex: 'status',
                    key: 'status',
                    width: 120,
                    render: (status, record) => {
                      if (status === 'pending') return <Tag color="blue">PENDIENTE</Tag>;
                      if (status === 'uploading') return <Tag color="orange">SUBIENDO...</Tag>;
                      if (status === 'success') return <Tag color="green">CARGADO</Tag>;
                      if (status === 'error') {
                        const isDup = record.error && (record.error.includes('ya está registrada') || record.error.includes('ya fue registrada') || record.error.includes('duplicad'));
                        const label = isDup ? 'DUPLICADA' : 'ERROR';
                        return <Tooltip title={record.error}><Tag color="red">{label}</Tag></Tooltip>;
                      }
                      if (status === 'orphan') return <Tag color="orange">HUÉRFANO</Tag>;
                      return <Tag>{status}</Tag>;
                    }
                  },
                  {
                    title: 'Acción',
                    key: 'action',
                    width: 70,
                    align: 'center',
                    render: (_, record) => (
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        size="small"
                        onClick={() => handleRemoveMatchedInvoice(record.key)}
                      />
                    )
                  }
                ]}
              />
            </div>
          )}
        </Form>
      </Modal>

      {/* MODAL DE REGISTRO DE DEVOLUCIÓN */}
      <Modal
        title={<span style={{ color: '#0A2647', fontWeight: 600 }}>Registrar Comprobante de Devolución</span>}
        open={isReturnModalOpen}
        onOk={handleUploadReturnReceipt}
        onCancel={() => {
          setIsReturnModalOpen(false);
          setReturnFileList([]);
        }}
        okText="Registrar Devolución"
        cancelText="Cancelar"
        destroyOnClose
        width={450}
      >
        <div style={{ marginTop: 16, marginBottom: 16 }}>
          <p style={{ color: '#555' }}>
            Suba el comprobante de transferencia o depósito correspondiente al reintegro del saldo del anticipo de este GRC por un monto de:
            <strong style={{ display: 'block', fontSize: 18, color: '#E67E22', marginTop: 8 }}>
              $ {selectedGrc?.monto_devuelto?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </strong>
          </p>
          
          <div style={{ marginTop: 24 }}>
            <label style={{ display: 'block', fontWeight: 500, marginBottom: 8, color: '#333' }}>Comprobante de Devolución (PDF o Imagen) *</label>
            <Upload
              accept=".pdf,.jpg,.jpeg,.png"
              fileList={returnFileList}
              beforeUpload={(file) => {
                setReturnFileList([file]);
                return false;
              }}
              onRemove={() => setReturnFileList([])}
            >
              <Button icon={<UploadOutlined />}>Seleccionar Archivo</Button>
            </Upload>
          </div>
        </div>
      </Modal>
    </div>
  );
}
