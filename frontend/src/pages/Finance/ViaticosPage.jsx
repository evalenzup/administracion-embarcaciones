/**
 * SIAE — Módulo de Viáticos (Comisiones de Viaje).
 * Interfaz de usuario para control de comisiones de viaje, asignaciones, montos y facturas asociadas.
 * Soporta carga de solicitudes en PDF, parseo de firmas digitales y cronograma de firmas.
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
  Upload,
  message,
  Tooltip,
  Alert,
  Popconfirm,
  Timeline,
  Spin,
  Tabs
} from 'antd';
import {
  PlusOutlined,
  UploadOutlined,
  EyeOutlined,
  DeleteOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  DollarOutlined,
  EditOutlined,
  CompassOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  InboxOutlined,
  SyncOutlined,
  FileZipOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  CameraOutlined,
  CloseCircleOutlined,
  SearchOutlined,
  InfoCircleOutlined,
  FolderOpenOutlined,
  SafetyCertificateOutlined,
  WarningOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { TextArea } = Input;
const { RangePicker } = DatePicker;
const { Dragger } = Upload;
const { TabPane } = Tabs;

const STATUS_MAP = {
  borrador: { label: 'Borrador', color: 'default' },
  solicitado: { label: 'Solicitado', color: 'blue' },
  aprobado: { label: 'Aprobado', color: 'orange' },
  comprobacion_pendiente: { label: 'Comp. Pendiente', color: 'cyan' },
  comprobado: { label: 'Comprobado', color: 'green' },
  rechazado: { label: 'Rechazado', color: 'red' }
};

export default function ViaticosPage() {
  const [viaticosList, setViaticosList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  
  // Catálogos
  const [personnel, setPersonnel] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);

  // Modales y Estados de PDF
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingViatico, setEditingViatico] = useState(null);
  const [form] = Form.useForm();
  const [parsingPdf, setParsingPdf] = useState(false);
  const [parsedSignatures, setParsedSignatures] = useState(null);
  const [parsedPdfPath, setParsedPdfPath] = useState(null);

  // Detalle e Invoices
  const [selectedViatico, setSelectedViatico] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [replacingPdf, setReplacingPdf] = useState(false);
  const [detailTab, setDetailTab] = useState('general');
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [invoiceForm] = Form.useForm();
  const [xmlFileList, setXmlFileList] = useState([]);
  const [pdfFileList, setPdfFileList] = useState([]);
  
  // Buscador de Facturas en modal de detalle
  const [invoiceSearchText, setInvoiceSearchText] = useState('');
  
  // Bulk Invoice upload states
  const [matchedInvoices, setMatchedInvoices] = useState([]);
  const [processingFiles, setProcessingFiles] = useState(false);
  const [isUploadingMulti, setIsUploadingMulti] = useState(false);

  // Estados para documentos de liquidación y cierre
  const [isDevolucionModalOpen, setIsDevolucionModalOpen] = useState(false);
  const [uploadingComprobacion, setUploadingComprobacion] = useState(false);
  const [uploadingReporte, setUploadingReporte] = useState(false);
  const [uploadingDevolucion, setUploadingDevolucion] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [uploadingTicketForInv, setUploadingTicketForInv] = useState(null);
  const [uploadingPdfForInv, setUploadingPdfForInv] = useState(null);
  const [uploadingXmlForInv, setUploadingXmlForInv] = useState(null);
  const [devolucionForm] = Form.useForm();

  const { hasPermission } = useAuth();
  const isAdmin = hasPermission('viaticos', 'edit');

  useEffect(() => {
    fetchViaticos();
    fetchStats();
    fetchCatalogos();
  }, []);

  const fetchViaticos = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/viaticos', { params: { limit: 100 } });
      setViaticosList(res.data.items || []);
    } catch (error) {
      message.error('Error al cargar la lista de viáticos');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await apiClient.get('/viaticos/stats');
      setStats(res.data);
    } catch (error) {
      console.error('Error al cargar estadísticas', error);
    }
  };

  const fetchCatalogos = async () => {
    try {
      const [accRes, catRes, personnelRes, usersRes] = await Promise.all([
        apiClient.get('/accounts'),
        apiClient.get('/petty-cash/categories?active_only=true'),
        apiClient.get('/personnel', { params: { limit: 500 } }),
        apiClient.get('/users/options')
      ]);

      const activeAccounts = (accRes.data || []).filter(
        a => a.account_number !== "FF-DEO-01" && !a.name.toLowerCase().includes("fondo fijo")
      );
      setAccounts(activeAccounts);
      setCategories(catRes.data || []);
      setPersonnel(personnelRes.data.items || personnelRes.data || []);
      setUsers(usersRes.data || []);
    } catch (error) {
      console.error('Error al cargar catálogos', error);
      message.error('Error al cargar catálogos de cuentas o personal');
    }
  };

  const getFileUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const apiBase = apiClient.defaults.baseURL || '';
    const backendBase = apiBase.replace('/api/v1', '');
    return `${backendBase}${path}`;
  };

  const handleOpenCreate = () => {
    setEditingViatico(null);
    setParsedSignatures(null);
    setParsedPdfPath(null);
    form.resetFields();
    setIsFormOpen(true);
  };

  const handleOpenEdit = (v) => {
    setEditingViatico(v);
    setParsedPdfPath(v.solicitud_pdf_path);
    setParsedSignatures({
      firma_solicitante_nombre: v.firma_solicitante_nombre,
      firma_solicitante_fecha: v.firma_solicitante_fecha,
      firma_solicitante_hash: v.firma_solicitante_hash,
      firma_jefe_nombre: v.firma_jefe_nombre,
      firma_jefe_fecha: v.firma_jefe_fecha,
      firma_jefe_hash: v.firma_jefe_hash,
      firma_revisor_nombre: v.firma_revisor_nombre,
      firma_revisor_fecha: v.firma_revisor_fecha,
      firma_revisor_hash: v.firma_revisor_hash,
      firma_tesoreria_nombre: v.firma_tesoreria_nombre,
      firma_tesoreria_fecha: v.firma_tesoreria_fecha,
      firma_tesoreria_hash: v.firma_tesoreria_hash
    });
    form.setFieldsValue({
      folio_comision: v.folio_comision,
      personal_id: v.personal_id,
      rango_fechas: [dayjs(v.fecha_inicio), dayjs(v.fecha_fin)],
      destino: v.destino,
      justificacion: v.justificacion,
      observaciones: v.observaciones,
      monto_solicitado: v.monto_solicitado,
      monto_viaticos: v.monto_viaticos || 0,
      monto_pasaje_aereo: v.monto_pasaje_aereo || 0,
      monto_hospedaje_paquete: v.monto_hospedaje_paquete || 0,
      monto_arrendamiento_vehiculos: v.monto_arrendamiento_vehiculos || 0,
      monto_pasaje_terrestre: v.monto_pasaje_terrestre || 0,
      monto_gasolina: v.monto_gasolina || 0,
      account_id: v.account_id,
      status: v.status,
      asistente_id: v.asistente_id
    });
    setIsFormOpen(true);
  };

  // Parser de PDF de solicitud para autocompletado
  const handlePdfParse = async (file) => {
    setParsingPdf(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await apiClient.post('/viaticos/parse-pdf', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      message.success('PDF de solicitud analizado con éxito. Campos autocompletados.');
      const d = res.data;
      
      form.setFieldsValue({
        folio_comision: d.folio_comision || '',
        personal_id: d.personal_id || undefined,
        rango_fechas: d.fecha_inicio && d.fecha_fin ? [dayjs(d.fecha_inicio), dayjs(d.fecha_fin)] : undefined,
        destino: d.destino || '',
        justificacion: d.justificacion || '',
        monto_solicitado: d.monto_solicitado || 0,
        monto_viaticos: d.monto_viaticos || 0,
        monto_pasaje_aereo: d.monto_pasaje_aereo || 0,
        monto_hospedaje_paquete: d.monto_hospedaje_paquete || 0,
        monto_arrendamiento_vehiculos: d.monto_arrendamiento_vehiculos || 0,
        monto_pasaje_terrestre: d.monto_pasaje_terrestre || 0,
        monto_gasolina: d.monto_gasolina || 0,
        account_id: d.account_id || undefined,
      });
      
      setParsedPdfPath(d.solicitud_pdf_path || null);

      // Guardar firmas y metadatos temporalmente
      setParsedSignatures({
        firma_solicitante_nombre: d.firma_solicitante_nombre,
        firma_solicitante_fecha: d.firma_solicitante_fecha,
        firma_solicitante_hash: d.firma_solicitante_hash,
        firma_jefe_nombre: d.firma_jefe_nombre,
        firma_jefe_fecha: d.firma_jefe_fecha,
        firma_jefe_hash: d.firma_jefe_hash,
        firma_revisor_nombre: d.firma_revisor_nombre,
        firma_revisor_fecha: d.firma_revisor_fecha,
        firma_revisor_hash: d.firma_revisor_hash,
        firma_tesoreria_nombre: d.firma_tesoreria_nombre,
        firma_tesoreria_fecha: d.firma_tesoreria_fecha,
        firma_tesoreria_hash: d.firma_tesoreria_hash,
        fecha_solicitud: d.fecha_solicitud
      });
    } catch (error) {
      if (error.response?.data?.detail) {
        message.error(error.response.data.detail);
      } else {
        message.error('Error al parsear el PDF de la solicitud.');
      }
    } finally {
      setParsingPdf(false);
    }
    return false; // Evita subida automática en frontend
  };

  // Reemplazar PDF de solicitud existente
  const handleReplacePdf = async (file) => {
    setReplacingPdf(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await apiClient.post(`/viaticos/${selectedViatico.id}/replace-pdf`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      message.success('Solicitud PDF reemplazada y firmas actualizadas con éxito.');
      setSelectedViatico(res.data);
      fetchViaticos();
      fetchStats();
    } catch (error) {
      if (error.response?.data?.detail) {
        message.error(error.response.data.detail);
      } else {
        message.error('Error al actualizar el PDF.');
      }
    } finally {
      setReplacingPdf(false);
    }
    return false;
  };

  const handleSaveViatico = async () => {
    try {
      const values = await form.validateFields();
      const [fecha_inicio, fecha_fin] = values.rango_fechas;
      
      const payload = {
        folio_comision: values.folio_comision,
        personal_id: values.personal_id,
        fecha_inicio: fecha_inicio.format('YYYY-MM-DD'),
        fecha_fin: fecha_fin.format('YYYY-MM-DD'),
        destino: values.destino,
        justificacion: values.justificacion,
        observaciones: values.observaciones,
        monto_solicitado: values.monto_solicitado,
        monto_viaticos: values.monto_viaticos || 0,
        monto_pasaje_aereo: values.monto_pasaje_aereo || 0,
        monto_hospedaje_paquete: values.monto_hospedaje_paquete || 0,
        monto_arrendamiento_vehiculos: values.monto_arrendamiento_vehiculos || 0,
        monto_pasaje_terrestre: values.monto_pasaje_terrestre || 0,
        monto_gasolina: values.monto_gasolina || 0,
        account_id: values.account_id,
        asistente_id: values.asistente_id,
        ...parsedSignatures // Fusionar firmas extraídas
      };

      if (editingViatico) {
        payload.status = values.status || editingViatico.status;
        await apiClient.put(`/viaticos/${editingViatico.id}`, payload);
        message.success('Comisión de viáticos actualizada');
      } else {
        payload.solicitud_pdf_path = parsedPdfPath;
        await apiClient.post('/viaticos', payload);
        message.success('Comisión de viáticos registrada con éxito');
      }

      setParsedPdfPath(null);
      setIsFormOpen(false);
      fetchViaticos();
      fetchStats();
    } catch (error) {
      if (error.response?.data?.detail) {
        message.error(error.response.data.detail);
      } else {
        message.error('Error al guardar comisión de viáticos');
      }
    }
  };

  const handleDeleteViatico = async (id) => {
    try {
      await apiClient.delete(`/viaticos/${id}`);
      message.success('Comisión de viáticos eliminada');
      fetchViaticos();
      fetchStats();
    } catch (error) {
      message.error('Error al eliminar comisión');
    }
  };

  const handleOpenDetail = async (v) => {
    try {
      const res = await apiClient.get(`/viaticos/${v.id}`);
      setSelectedViatico(res.data);
      setDetailTab('general');
      setIsDetailOpen(true);
    } catch (error) {
      message.error('Error al obtener detalle del viático');
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
          const emisorNombre = emisor ? emisor.getAttribute("Nombre") : "";

          const conceptosList = [];
          const conceptos = xmlDoc.getElementsByTagName("cfdi:Concepto");
          for (let i = 0; i < conceptos.length; i++) {
            const c = conceptos[i];
            conceptosList.push({
              clave: c.getAttribute("ClaveProdServ") || "",
              descripcion: c.getAttribute("Descripcion") || ""
            });
          }
          if (conceptosList.length === 0) {
            const conceptosNoPrefix = xmlDoc.getElementsByTagName("Concepto");
            for (let i = 0; i < conceptosNoPrefix.length; i++) {
              const c = conceptosNoPrefix[i];
              conceptosList.push({
                clave: c.getAttribute("ClaveProdServ") || "",
                descripcion: c.getAttribute("Descripcion") || ""
              });
            }
          }
          
          resolve({ uuid, rfc, emisorNombre, conceptosList });
        } catch (err) {
          resolve({ uuid: null, rfc: null, emisorNombre: "", conceptosList: [] });
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
        emisorNombre: parsed.emisorNombre,
        conceptosList: parsed.conceptosList,
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

      const isDuplicate = selectedViatico.facturas?.some(f => f.uuid && xml.uuid && f.uuid.toLowerCase().replace(/-/g, '') === xml.uuid.toLowerCase().replace(/-/g, ''));

      // Intentar clasificar la factura automáticamente
      let predictedCategoryId = undefined;
      const guessCategory = (emisorNombre, conceptosList) => {
        const name = (emisorNombre || "").toLowerCase();
        
        // 1. Gasolina/Combustible
        const hasGas = conceptosList.some(c => 
          c.clave.startsWith("1510") || 
          c.descripcion.toLowerCase().includes("gasolina") ||
          c.descripcion.toLowerCase().includes("magna") ||
          c.descripcion.toLowerCase().includes("premium") ||
          c.descripcion.toLowerCase().includes("diesel") ||
          c.descripcion.toLowerCase().includes("combustible")
        );
        if (hasGas || name.includes("gasolin") || name.includes("combust") || name.includes("servicio") || name.includes("estacion")) {
          return "gasolina";
        }

        // 2. Paquete Hospedaje + Comida
        const hasPaquete = conceptosList.some(c => 
          c.descripcion.toLowerCase().includes("paquete") ||
          (c.descripcion.toLowerCase().includes("hospedaje") && c.descripcion.toLowerCase().includes("alimento"))
        );
        if (hasPaquete || name.toLowerCase().includes("paquete")) {
          return "paquete hospedaje + comida";
        }

        // 3. Hospedaje
        const hasHospedaje = conceptosList.some(c => 
          c.clave.startsWith("9011") || 
          c.descripcion.toLowerCase().includes("hospedaje") ||
          c.descripcion.toLowerCase().includes("habitacion") ||
          c.descripcion.toLowerCase().includes("hotel") ||
          c.descripcion.toLowerCase().includes("alojamiento") ||
          c.descripcion.toLowerCase().includes("motel")
        );
        if (hasHospedaje || name.includes("hotel") || name.includes("hospedaje") || name.includes("motel") || name.includes("posada") || name.includes("lodging") || name.includes("turistica")) {
          return "hospedaje";
        }

        // 3. Avión
        const hasAvion = conceptosList.some(c => 
          c.clave.startsWith("781115") || 
          c.descripcion.toLowerCase().includes("aereo") ||
          c.descripcion.toLowerCase().includes("aéreo") ||
          c.descripcion.toLowerCase().includes("vuelo") ||
          c.descripcion.toLowerCase().includes("avion") ||
          c.descripcion.toLowerCase().includes("avión")
        );
        const nameLower = name.toLowerCase();
        if (hasAvion || nameLower.includes("aeromexico") || nameLower.includes("volaris") || nameLower.includes("vivaaerobus") || nameLower.includes("vuelo") || nameLower.includes("airline") || nameLower.includes("aéreo") || nameLower.includes("aereo")) {
          return "avión";
        }

        // 4. Transporte
        const hasTransporte = conceptosList.some(c => 
          c.clave.startsWith("7811") || 
          c.clave.startsWith("9511") || 
          c.descripcion.toLowerCase().includes("peaje") ||
          c.descripcion.toLowerCase().includes("caseta") ||
          c.descripcion.toLowerCase().includes("autobus") ||
          c.descripcion.toLowerCase().includes("boleto") ||
          c.descripcion.toLowerCase().includes("pasaje") ||
          c.descripcion.toLowerCase().includes("taxi") ||
          c.descripcion.toLowerCase().includes("uber") ||
          c.descripcion.toLowerCase().includes("transporte")
        );
        if (hasTransporte || name.includes("autobus") || name.includes("taxi") || name.includes("uber") || name.includes("ado") || name.includes("casetas") || name.includes("peaje") || name.includes("autopista")) {
          return "transporte";
        }

        // 4. Alimentos
        const hasAlimentos = conceptosList.some(c => 
          c.clave.startsWith("9010") || 
          c.clave.startsWith("5019") || 
          c.descripcion.toLowerCase().includes("alimento") ||
          c.descripcion.toLowerCase().includes("consumo") ||
          c.descripcion.toLowerCase().includes("restaurante") ||
          c.descripcion.toLowerCase().includes("comida") ||
          c.descripcion.toLowerCase().includes("cena") ||
          c.descripcion.toLowerCase().includes("desayuno") ||
          c.descripcion.toLowerCase().includes("cafe")
        );
        if (hasAlimentos || name.includes("oxxo") || name.includes("7-eleven") || name.includes("restauran") || name.includes("cafe") || name.includes("comida") || name.includes("sirena") || name.includes("subway") || name.includes("starbucks") || name.includes("vip") || name.includes("alimento")) {
          return "alimentos";
        }

        return null;
      };

      const guessedKeyword = guessCategory(xml.emisorNombre, xml.conceptosList);
      if (guessedKeyword) {
        const mappedCat = categories.find(c => c.name.toLowerCase() === guessedKeyword);
        if (mappedCat) predictedCategoryId = mappedCat.id;
      }

      matched.push({
        key: `xml-${idx}`,
        xmlFile: xml.file,
        pdfFile: matchedPdf || null,
        uuid: xml.uuid || 'No encontrado',
        rfc: xml.rfc || 'No encontrado',
        status: isDuplicate ? 'error' : 'pending',
        error: isDuplicate ? 'Esta factura ya está registrada en esta comprobación.' : null,
        category_id: predictedCategoryId
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

  const handleOpenInvoiceModal = () => {
    invoiceForm.resetFields();
    setXmlFileList([]);
    setPdfFileList([]);
    setMatchedInvoices([]);
    setIsInvoiceModalOpen(true);
  };

  const handleUploadInvoice = async () => {
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
      if (inv.category_id) {
        formData.append('category_id', inv.category_id);
      }
      if (values.description) {
        formData.append('description', values.description);
      }

      try {
        inv.status = 'uploading';
        setMatchedInvoices([...updatedInvoices]);

        await apiClient.post(`/viaticos/${selectedViatico.id}/invoices`, formData, {
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
      const res = await apiClient.get(`/viaticos/${selectedViatico.id}`);
      setSelectedViatico(res.data);
      fetchViaticos();
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
      await apiClient.delete(`/viaticos/invoices/${invId}`);
      message.success('Factura eliminada');
      
      // Recargar detalles
      const res = await apiClient.get(`/viaticos/${selectedViatico.id}`);
      setSelectedViatico(res.data);
      fetchViaticos();
    } catch (error) {
      message.error('Error al eliminar factura');
    }
  };

  const handleUpdateInvoiceCategory = async (invoiceId, categoryId) => {
    try {
      await apiClient.put(`/viaticos/invoices/${invoiceId}/category`, { category_id: categoryId });
      message.success('Categoría de factura actualizada');
      const res = await apiClient.get(`/viaticos/${selectedViatico.id}`);
      setSelectedViatico(res.data);
      fetchViaticos();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Error al actualizar la categoría');
    }
  };

  const handleVerifySat = async (invoiceId) => {
    try {
      const res = await apiClient.post(`/viaticos/invoices/${invoiceId}/verify-sat`);
      message.success(res.data.message);
      const detailRes = await apiClient.get(`/viaticos/${selectedViatico.id}`);
      setSelectedViatico(detailRes.data);
      fetchViaticos();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Error al conectar con el SAT');
    }
  };

  const handleDownloadInvoicesZip = async (id) => {
    setDownloadingZip(true);
    try {
      const response = await apiClient.get(`/viaticos/${id}/invoices/zip`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `facturas_viatico_${selectedViatico.folio_comision}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      message.success('Paquete ZIP de facturas descargado correctamente');
    } catch (error) {
      message.error('Error al descargar el archivo ZIP de facturas.');
    } finally {
      setDownloadingZip(false);
    }
  };

  const handleDownloadInvoicesExcel = async (id) => {
    setDownloadingExcel(true);
    try {
      const response = await apiClient.get(`/viaticos/${id}/invoices/excel`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `comprobacion_viatico_${selectedViatico.folio_comision}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      message.success('Reporte Excel (.xlsx) descargado correctamente');
    } catch (error) {
      message.error('Error al descargar el archivo Excel de comprobación.');
    } finally {
      setDownloadingExcel(false);
    }
  };

  const handleUploadInvoiceTicket = async (invoiceId, file) => {
    const isImageOrPdf = file.type.startsWith('image/') || file.type === 'application/pdf' || file.name.match(/\.(jpg|jpeg|png|webp|pdf)$/i);
    if (!isImageOrPdf) {
      message.error('El comprobante debe ser una imagen (JPG, PNG, WebP) o un archivo PDF.');
      return false;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    setUploadingTicketForInv(invoiceId);

    try {
      const res = await apiClient.post(`/viaticos/invoices/${invoiceId}/ticket`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      message.success('Ticket / Justificante de consumo adjuntado con éxito');
      
      if (selectedViatico && selectedViatico.facturas) {
        const updatedFacturas = selectedViatico.facturas.map(f => f.id === invoiceId ? res.data : f);
        setSelectedViatico({ ...selectedViatico, facturas: updatedFacturas });
      }
      fetchViaticos();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Error al subir el ticket');
    } finally {
      setUploadingTicketForInv(null);
    }
    return false;
  };

  const handleDeleteInvoiceTicket = async (invoiceId) => {
    setUploadingTicketForInv(invoiceId);
    try {
      const res = await apiClient.delete(`/viaticos/invoices/${invoiceId}/ticket`);
      message.success('Ticket / Justificante eliminado');
      if (selectedViatico && selectedViatico.facturas) {
        const updatedFacturas = selectedViatico.facturas.map(f => f.id === invoiceId ? res.data : f);
        setSelectedViatico({ ...selectedViatico, facturas: updatedFacturas });
      }
      fetchViaticos();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Error al eliminar el ticket');
    } finally {
      setUploadingTicketForInv(null);
    }
  };

  const handleUploadInvoicePdf = async (invoiceId, file) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      message.error('El archivo debe ser un documento PDF (.pdf)');
      return false;
    }

    const formData = new FormData();
    formData.append('file', file);
    setUploadingPdfForInv(invoiceId);

    try {
      const res = await apiClient.post(`/viaticos/invoices/${invoiceId}/pdf`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      message.success('Archivo PDF validado y vinculado con éxito a la factura');

      if (selectedViatico && selectedViatico.facturas) {
        const updatedFacturas = selectedViatico.facturas.map(f => f.id === invoiceId ? res.data : f);
        setSelectedViatico({ ...selectedViatico, facturas: updatedFacturas });
      }
      fetchViaticos();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Error al subir y validar el archivo PDF');
    } finally {
      setUploadingPdfForInv(null);
    }
    return false;
  };

  const handleUploadInvoiceXml = async (invoiceId, file) => {
    if (!file.name.toLowerCase().endsWith('.xml')) {
      message.error('El archivo debe ser un XML fiscal (.xml)');
      return false;
    }

    const formData = new FormData();
    formData.append('file', file);
    setUploadingXmlForInv(invoiceId);

    try {
      const res = await apiClient.post(`/viaticos/invoices/${invoiceId}/xml`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      message.success('Archivo XML validado y vinculado con éxito');

      if (selectedViatico && selectedViatico.facturas) {
        const updatedFacturas = selectedViatico.facturas.map(f => f.id === invoiceId ? res.data : f);
        setSelectedViatico({ ...selectedViatico, facturas: updatedFacturas });
      }
      fetchViaticos();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Error al subir el archivo XML');
    } finally {
      setUploadingXmlForInv(null);
    }
    return false;
  };

  const handleUploadComprobacionPdf = async (file) => {
    if (!selectedViatico) return false;
    const formData = new FormData();
    formData.append('file', file);
    setUploadingComprobacion(true);
    try {
      const res = await apiClient.post(`/viaticos/${selectedViatico.id}/upload-comprobacion-pdf`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      message.success('Comprobación EPISA cargada y firmas extraídas con éxito');
      setSelectedViatico(res.data);
      fetchViaticos();
      fetchStats();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Error al procesar el PDF de comprobación');
    } finally {
      setUploadingComprobacion(false);
    }
    return false;
  };

  const handleUploadReportePdf = async (file) => {
    if (!selectedViatico) return false;
    const formData = new FormData();
    formData.append('file', file);
    setUploadingReporte(true);
    try {
      const res = await apiClient.post(`/viaticos/${selectedViatico.id}/upload-reporte-pdf`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      message.success('Reporte de actividades cargado correctamente');
      setSelectedViatico(res.data);
      fetchViaticos();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Error al subir reporte de actividades');
    } finally {
      setUploadingReporte(false);
    }
    return false;
  };

  const handleOpenDevolucionModal = () => {
    if (!selectedViatico) return;
    const diff = Math.max(0, (selectedViatico.monto_solicitado || 0) - (selectedViatico.monto_comprobado || 0));
    const roundedDiff = Math.round(diff * 100) / 100;
    const initialMonto = selectedViatico.monto_devuelto != null ? Number(Number(selectedViatico.monto_devuelto).toFixed(2)) : roundedDiff;
    devolucionForm.setFieldsValue({
      monto_devuelto: initialMonto
    });
    setIsDevolucionModalOpen(true);
  };

  const handleUploadDevolucion = async (values) => {
    if (!selectedViatico) return;
    const file = values.comprobante_file?.fileList?.[0]?.originFileObj || values.comprobante_file?.file;
    if (!file) {
      message.error('Por favor selecciona el archivo del comprobante de devolución');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    if (values.monto_devuelto !== undefined && values.monto_devuelto !== null && values.monto_devuelto !== '') {
      const num = typeof values.monto_devuelto === 'number' ? values.monto_devuelto : parseFloat(String(values.monto_devuelto).replace(/,/g, ''));
      if (!isNaN(num)) {
        formData.append('monto_devuelto', (Math.round(num * 100) / 100).toFixed(2));
      }
    }

    setUploadingDevolucion(true);
    try {
      const res = await apiClient.post(`/viaticos/${selectedViatico.id}/upload-return-receipt`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      message.success('Comprobante de devolución registrado y comisión liquidada');
      setSelectedViatico(res.data);
      setIsDevolucionModalOpen(false);
      devolucionForm.resetFields();
      fetchViaticos();
      fetchStats();
    } catch (error) {
      const detail = error.response?.data?.detail;
      const errorMsg = Array.isArray(detail) ? detail.map(d => d.msg || JSON.stringify(d)).join(', ') : (typeof detail === 'string' ? detail : 'Error al registrar comprobante de devolución');
      message.error(errorMsg);
    } finally {
      setUploadingDevolucion(false);
    }
  };

  const handleClearFile = async (fileType) => {
    if (!selectedViatico) return;
    try {
      const res = await apiClient.delete(`/viaticos/${selectedViatico.id}/clear-file/${fileType}`);
      message.success('Archivo eliminado correctamente');
      setSelectedViatico(res.data);
      fetchViaticos();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Error al eliminar el archivo');
    }
  };

  // Filtrado de facturas en modal de detalle de viáticos
  const filteredViaticoFacturas = (selectedViatico?.facturas || []).filter((inv) => {
    if (!invoiceSearchText.trim()) return true;
    const q = invoiceSearchText.trim().toLowerCase();
    const emisor = (inv.emisor_nombre || '').toLowerCase();
    const rfc = (inv.emisor_rfc || '').toLowerCase();
    const uuid = (inv.uuid || '').toLowerCase();
    const folio = (inv.folio || '').toLowerCase();
    const serie = (inv.serie || '').toLowerCase();
    const desc = (inv.description || '').toLowerCase();
    return (
      emisor.includes(q) ||
      rfc.includes(q) ||
      uuid.includes(q) ||
      folio.includes(q) ||
      serie.includes(q) ||
      desc.includes(q)
    );
  });

  // Obtener desglose de presupuesto Solicitado vs Comprobado por categoría
  const getCategoryComparison = () => {
    if (!selectedViatico) return [];
    
    const getSpent = (catNames) => {
      if (!selectedViatico.facturas) return 0;
      return selectedViatico.facturas
        .filter(f => {
          const cat = categories.find(c => c.id === f.category_id);
          return cat && catNames.map(n => n.toLowerCase()).includes(cat.name.toLowerCase());
        })
        .reduce((sum, f) => sum + (f.total || 0), 0);
    };

    return [
      {
        concept: 'Viáticos (Alimentos / Hospedaje)',
        icon: '🍔',
        budget: selectedViatico.monto_viaticos || 0,
        spent: getSpent(['Alimentos', 'Hospedaje'])
      },
      {
        concept: 'Avión (37104)',
        icon: '✈️',
        budget: selectedViatico.monto_pasaje_aereo || 0,
        spent: getSpent(['Avión'])
      },
      {
        concept: 'Hotel / Paquete (37504)',
        icon: '🏨',
        budget: selectedViatico.monto_hospedaje_paquete || 0,
        spent: getSpent(['Paquete Hospedaje + Comida'])
      },
      {
        concept: 'Renta Vehículo (32503)',
        icon: '🚗',
        budget: selectedViatico.monto_arrendamiento_vehiculos || 0,
        spent: getSpent(['Renta Auto']) // por si acaso
      },
      {
        concept: 'Pasaje Terrestre (37204)',
        icon: '🚌',
        budget: selectedViatico.monto_pasaje_terrestre || 0,
        spent: getSpent(['Transporte'])
      },
      {
        concept: 'Gasolina (26103)',
        icon: '⛽',
        budget: selectedViatico.monto_gasolina || 0,
        spent: getSpent(['Gasolina'])
      }
    ].filter(item => item.budget > 0 || item.spent > 0);
  };

  // Renderizar la línea de tiempo de firmas de Solicitud Inicial
  const renderSolicitudTimeline = (v) => {
    const steps = [
      {
        title: '1. Solicitante / Comisionado',
        name: v.firma_solicitante_nombre,
        fecha: v.firma_solicitante_fecha,
        hash: v.firma_solicitante_hash,
        role: 'Comisionado'
      },
      {
        title: '2. Responsable de Cuenta / Jefe Inmediato',
        name: v.firma_jefe_nombre || v.firma_responsable_nombre,
        fecha: v.firma_jefe_fecha || v.firma_responsable_fecha,
        hash: v.firma_jefe_hash || v.firma_responsable_hash,
        role: 'Responsable de Cuenta / Jefe Inmediato'
      },
      {
        title: '3. Revisor Administrativo',
        name: v.firma_revisor_nombre,
        fecha: v.firma_revisor_fecha,
        hash: v.firma_revisor_hash,
        role: 'Revisor Administrativo'
      },
      {
        title: '4. Ventanilla de Tesorería (Pago)',
        name: v.firma_tesoreria_nombre,
        fecha: v.firma_tesoreria_fecha,
        hash: v.firma_tesoreria_hash,
        role: 'Ventanilla de Tesorería (Pago)'
      }
    ];

    return (
      <Timeline style={{ marginTop: 16 }}>
        {steps.map((step, idx) => {
          const isSigned = !!step.name;
          return (
            <Timeline.Item
              key={idx}
              color={isSigned ? 'green' : 'gray'}
              dot={isSigned ? <CheckCircleOutlined style={{ fontSize: 16 }} /> : <ClockCircleOutlined style={{ fontSize: 16 }} />}
            >
              <div>
                <b style={{ color: isSigned ? '#1B4F72' : '#8c8c8c' }}>{step.title}</b>
                {isSigned ? (
                  <div style={{
                    marginTop: 6,
                    padding: '8px 12px',
                    background: '#f6ffed',
                    border: '1px solid #b7eb8f',
                    borderRadius: 6,
                    fontSize: 13
                  }}>
                    <div><b>Firmante:</b> {step.name}</div>
                    {step.fecha && <div><b>Fecha y Hora:</b> {dayjs(step.fecha).format('DD/MM/YYYY HH:mm:ss')}</div>}
                  </div>
                ) : (
                  <div style={{ color: '#8c8c8c', fontStyle: 'italic', marginTop: 2, fontSize: 12 }}>
                    Pendiente de firma en solicitud
                  </div>
                )}
              </div>
            </Timeline.Item>
          );
        })}
      </Timeline>
    );
  };

  // Renderizar la línea de tiempo de firmas de Comprobación EPISA
  const renderComprobacionTimeline = (v) => {
    const steps = [
      {
        title: '1. Responsable de Cuenta / Solicitante',
        name: v.firma_comp_solicitante_nombre,
        fecha: v.firma_comp_solicitante_fecha,
        hash: v.firma_comp_solicitante_hash
      },
      {
        title: '2. Revisor Administrativo',
        name: v.firma_comp_revisor_nombre,
        fecha: v.firma_comp_revisor_fecha,
        hash: v.firma_comp_revisor_hash
      },
      {
        title: '3. Ventanilla de Tesorería',
        name: v.firma_comp_tesoreria_nombre,
        fecha: v.firma_comp_tesoreria_fecha,
        hash: v.firma_comp_tesoreria_hash
      },
      {
        title: '4. Ventanilla de Contabilidad (Cierre)',
        name: v.firma_comp_contabilidad_nombre,
        fecha: v.firma_comp_contabilidad_fecha,
        hash: v.firma_comp_contabilidad_hash
      }
    ];

    return (
      <Timeline style={{ marginTop: 16 }}>
        {steps.map((step, idx) => {
          const isSigned = !!step.name;
          return (
            <Timeline.Item
              key={idx}
              color={isSigned ? 'green' : 'gray'}
              dot={isSigned ? <CheckCircleOutlined style={{ fontSize: 16 }} /> : <ClockCircleOutlined style={{ fontSize: 16 }} />}
            >
              <div>
                <b style={{ color: isSigned ? '#0E6251' : '#8c8c8c' }}>{step.title}</b>
                {isSigned ? (
                  <div style={{
                    marginTop: 6,
                    padding: '8px 12px',
                    background: '#e8f8f5',
                    border: '1px solid #a3e4d7',
                    borderRadius: 6,
                    fontSize: 13
                  }}>
                    <div><b>Firmante:</b> {step.name}</div>
                    {step.fecha && <div><b>Fecha y Hora:</b> {dayjs(step.fecha).format('DD/MM/YYYY HH:mm:ss')}</div>}
                  </div>
                ) : (
                  <div style={{ color: '#8c8c8c', fontStyle: 'italic', marginTop: 2, fontSize: 12 }}>
                    Pendiente de firma en comprobación EPISA
                  </div>
                )}
              </div>
            </Timeline.Item>
          );
        })}
      </Timeline>
    );
  };

  // Columnas de tabla
  const columns = [
    {
      title: 'Folio Comisión',
      dataIndex: 'folio_comision',
      key: 'folio_comision',
      width: 140,
      sorter: (a, b) => (a.folio_comision || '').localeCompare(b.folio_comision || '', undefined, { numeric: true }),
      render: (text, record) => <a onClick={() => handleOpenDetail(record)}><b>{text}</b></a>
    },
    {
      title: 'Comisionado',
      dataIndex: 'personal',
      key: 'personal',
      width: 220,
      ellipsis: true,
      sorter: (a, b) => {
        const nameA = a.personal ? `${a.personal.first_name || ''} ${a.personal.last_name || ''}`.trim() : '';
        const nameB = b.personal ? `${b.personal.first_name || ''} ${b.personal.last_name || ''}`.trim() : '';
        return nameA.localeCompare(nameB);
      },
      render: (p) => p ? `${p.first_name} ${p.last_name}` : 'No asignado'
    },
    {
      title: 'Destino',
      dataIndex: 'destino',
      key: 'destino',
      width: 200,
      ellipsis: true,
      sorter: (a, b) => (a.destino || '').localeCompare(b.destino || '')
    },
    {
      title: 'Fecha Inicio',
      dataIndex: 'fecha_inicio',
      key: 'fecha_inicio',
      width: 130,
      align: 'center',
      sorter: (a, b) => dayjs(a.fecha_inicio || 0).valueOf() - dayjs(b.fecha_inicio || 0).valueOf(),
      defaultSortOrder: 'descend',
      render: (d) => dayjs(d).format('DD/MM/YYYY')
    },
    {
      title: 'Fecha Fin',
      dataIndex: 'fecha_fin',
      key: 'fecha_fin',
      width: 130,
      align: 'center',
      sorter: (a, b) => dayjs(a.fecha_fin || 0).valueOf() - dayjs(b.fecha_fin || 0).valueOf(),
      render: (d, record) => {
        if (!d) return '—';
        const isPast = dayjs(d).isBefore(dayjs(), 'day');
        const isComprobado = record.status === 'comprobado';
        const isExpired = isPast && !isComprobado && record.status !== 'rechazado';

        if (isComprobado) {
          return (
            <Tooltip title="Comisión comprobada y cerrada">
              <span style={{ fontWeight: 'bold', color: '#1f1f1f' }}>
                {dayjs(d).format('DD/MM/YYYY')}
              </span>
            </Tooltip>
          );
        }

        if (isExpired) {
          const daysDiff = dayjs().diff(dayjs(d), 'day');
          return (
            <Tooltip title={`Comisión vencida hace ${daysDiff} día${daysDiff === 1 ? '' : 's'}`}>
              <span style={{ color: '#cf1322', fontWeight: 600 }}>
                {dayjs(d).format('DD/MM/YYYY')}
              </span>
            </Tooltip>
          );
        }

        return <span>{dayjs(d).format('DD/MM/YYYY')}</span>;
      }
    },
    {
      title: 'Monto Solicitado',
      dataIndex: 'monto_solicitado',
      key: 'monto_solicitado',
      width: 160,
      align: 'right',
      sorter: (a, b) => (a.monto_solicitado || 0) - (b.monto_solicitado || 0),
      render: (m, record) => (
        <Tooltip title={
          <div style={{ fontSize: '11px', lineHeight: '1.4' }}>
            <div>Viáticos (37504): ${record.monto_viaticos?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
            <div>Avión (37104): ${record.monto_pasaje_aereo?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
            <div>Paquete (37504): ${record.monto_hospedaje_paquete?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
            <div>Renta Auto (32503): ${record.monto_arrendamiento_vehiculos?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
            <div>Terrestre (37204): ${record.monto_pasaje_terrestre?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
            <div>Gasolina (26103): ${record.monto_gasolina?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
          </div>
        }>
          <span style={{ cursor: 'help', borderBottom: '1px dotted #ccc' }}>
            ${m.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </span>
        </Tooltip>
      )
    },
    {
      title: 'Monto Comprobado',
      dataIndex: 'monto_comprobado',
      key: 'monto_comprobado',
      width: 160,
      align: 'right',
      sorter: (a, b) => (a.monto_comprobado || 0) - (b.monto_comprobado || 0),
      render: (m) => (
        <span style={{ color: m > 0 ? '#52c41a' : '#d9d9d9', fontWeight: m > 0 ? 'bold' : 'normal' }}>
          ${m.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      title: 'Estado',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      align: 'center',
      sorter: (a, b) => (a.status || '').localeCompare(b.status || ''),
      render: (status) => {
        const config = STATUS_MAP[status] || { label: status, color: 'default' };
        return <Tag color={config.color}>{config.label}</Tag>;
      }
    },
    {
      title: 'Acciones',
      key: 'acciones',
      width: 120,
      fixed: 'right',
      align: 'center',
      render: (_, record) => (
        <Space size="middle">
          <Tooltip title="Ver detalle">
            <Button icon={<EyeOutlined />} size="small" onClick={() => handleOpenDetail(record)} />
          </Tooltip>
          {isAdmin && (
            <>
              <Tooltip title="Editar">
                <Button icon={<EditOutlined />} size="small" onClick={() => handleOpenEdit(record)} />
              </Tooltip>
              <Popconfirm
                title="¿Eliminar esta comisión de viáticos?"
                onConfirm={() => handleDeleteViatico(record.id)}
                okText="Sí"
                cancelText="No"
              >
                <Button icon={<DeleteOutlined />} size="small" danger />
              </Popconfirm>
            </>
          )}
        </Space>
      )
    }
  ];

  return (
    <div style={{ padding: '0px' }}>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <Statistic
              title="Total Comisiones de Viáticos"
              value={stats?.total_count || 0}
              prefix={<CompassOutlined style={{ color: '#1B4F72' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <Statistic
              title="Pendientes de Comprobación"
              value={stats?.by_status?.comprobacion_pendiente || stats?.by_status?.aprobado || stats?.by_status?.solicitado || 0}
              valueStyle={{ color: '#cf1322' }}
              prefix={<CalendarOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <Statistic
              title="Comprobados y Cerrados"
              value={stats?.by_status?.comprobado || 0}
              valueStyle={{ color: '#3f8600' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <span style={{ fontSize: 18, color: '#0A2647', fontWeight: 600 }}>
            💼 Registro y Comprobación de Viáticos
          </span>
        }
        bordered={false}
        style={{ borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}
        extra={
          isAdmin && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenCreate}
              style={{ background: 'linear-gradient(135deg, #1B4F72, #2C74B3)', border: 'none', borderRadius: 8 }}
            >
              Registrar Comisión
            </Button>
          )
        }
      >
        <Table
          dataSource={viaticosList}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 15 }}
          scroll={{ x: 1280 }}
        />
      </Card>

      {/* Modal Formulario Registro/Edición */}
      <Modal
        title={
          <span style={{ color: '#0A2647', fontWeight: 600 }}>
            {editingViatico ? '✏️ Editar Comisión de Viáticos' : '✈️ Registrar Nueva Comisión de Viáticos'}
          </span>
        }
        open={isFormOpen}
        onCancel={() => setIsFormOpen(false)}
        onOk={handleSaveViatico}
        okText="Guardar"
        cancelText="Cancelar"
        width={650}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
          onValuesChange={(changedValues, allValues) => {
            if (
              changedValues.monto_viaticos !== undefined ||
              changedValues.monto_pasaje_aereo !== undefined ||
              changedValues.monto_hospedaje_paquete !== undefined ||
              changedValues.monto_arrendamiento_vehiculos !== undefined ||
              changedValues.monto_pasaje_terrestre !== undefined ||
              changedValues.monto_gasolina !== undefined
            ) {
              const viaticos = allValues.monto_viaticos || 0;
              const aereo = allValues.monto_pasaje_aereo || 0;
              const paquete = allValues.monto_hospedaje_paquete || 0;
              const renta = allValues.monto_arrendamiento_vehiculos || 0;
              const terrestre = allValues.monto_pasaje_terrestre || 0;
              const gasolina = allValues.monto_gasolina || 0;
              form.setFieldsValue({
                monto_solicitado: viaticos + aereo + paquete + renta + terrestre + gasolina
              });
            }
          }}
        >
          {/* Zona de parser PDF al crear */}
          {!editingViatico && (
            <div style={{ marginBottom: 20 }}>
              <Alert
                message="Autocompletar con PDF Oficial (Opcional)"
                description="Arrastra la Solicitud de recursos oficial de CICESE para extraer el folio, fechas, destino, monto, comisionado y firmas digitales de forma automática."
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
                  <p className="ant-upload-hint">Soporta solicitudes de apoyo a externos/comisionados oficiales de CICESE</p>
                </Dragger>
              </Spin>
            </div>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="folio_comision"
                label="Folio Comisión (Nomenclatura Oficial)"
                rules={[{ required: true, message: 'Ingresa el folio de la comisión' }]}
              >
                <Input placeholder="Ej: 120755" disabled={!!editingViatico} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="personal_id"
                label="Comisionado (Beneficiario)"
                rules={[{ required: true, message: 'Selecciona al comisionado' }]}
              >
                <Select
                  placeholder="Seleccionar comisionado"
                  showSearch
                  optionFilterProp="children"
                >
                  {personnel.map(p => (
                    <Select.Option key={p.id} value={p.id}>
                      {p.first_name} {p.last_name} ({p.employee_number || 'S/N'})
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="rango_fechas"
                label="Periodo de Comisión"
                rules={[{ required: true, message: 'Selecciona las fechas de viaje' }]}
              >
                <RangePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="destino"
                label="Destino de Comisión"
                rules={[{ required: true, message: 'Ingresa el destino de viaje' }]}
              >
                <Input placeholder="Ej: Tuxpan, Veracruz" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={6}>
              <Form.Item
                name="monto_viaticos"
                label="Viáticos (37504)"
                rules={[{ required: true, message: 'Requerido' }]}
              >
                <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="0.00" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                name="monto_pasaje_aereo"
                label="Avión (37104)"
              >
                <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="0.00" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                name="monto_hospedaje_paquete"
                label="Paquete Hotel (37504)"
              >
                <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="0.00" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                name="monto_arrendamiento_vehiculos"
                label="Renta Vehículo (32503)"
              >
                <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="0.00" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={6}>
              <Form.Item
                name="monto_pasaje_terrestre"
                label="Pasaje Terrestre (37204)"
              >
                <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="0.00" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                name="monto_gasolina"
                label="Gasolina (26103)"
              >
                <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="0.00" />
              </Form.Item>
            </Col>
            <Col span={6}>
              {/* Espaciador */}
            </Col>
            <Col span={6}>
              <Form.Item
                name="monto_solicitado"
                label="Presupuesto Total"
                tooltip="Suma total calculada automáticamente"
              >
                <InputNumber style={{ width: '100%', fontWeight: 'bold' }} disabled precision={2} placeholder="0.00" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={24}>
              <Form.Item
                name="account_id"
                label="Cuenta de Origen"
                rules={[{ required: true, message: 'Selecciona la cuenta de origen' }]}
              >
                <Select placeholder="Seleccionar cuenta de origen" allowClear>
                  {accounts.map(a => (
                    <Select.Option key={a.id} value={a.id}>
                      {a.name} ({a.account_number})
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
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
            {editingViatico && (
              <Col span={12}>
                <Form.Item name="status" label="Estado del Trámite">
                  <Select>
                    {Object.keys(STATUS_MAP).map(key => (
                      <Select.Option key={key} value={key}>
                        {STATUS_MAP[key].label}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            )}
          </Row>

          <Form.Item
            name="justificacion"
            label="Justificación de la Comisión"
            rules={[{ required: true, message: 'Ingresa la justificación' }]}
          >
            <TextArea rows={3} placeholder="Motivo del viaje o actividades a realizar..." />
          </Form.Item>

          <Form.Item name="observaciones" label="Observaciones">
            <TextArea rows={2} placeholder="Notas adicionales..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Detalle de Comisión, Expediente, Facturas y Firmas */}
      <Modal
        title={
          selectedViatico ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 24, flexWrap: 'wrap', gap: 8 }}>
              <Space align="center" size="middle">
                <span style={{ fontSize: 18, color: '#0A2647', fontWeight: 700 }}>
                  ✈️ Comisión {selectedViatico.folio_comision}
                </span>
                <Tag color={STATUS_MAP[selectedViatico.status]?.color || 'default'} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4 }}>
                  {STATUS_MAP[selectedViatico.status]?.label?.toUpperCase() || selectedViatico.status}
                </Tag>
              </Space>
              <div style={{ fontSize: 12, color: '#555' }}>
                📍 <b>{selectedViatico.destino}</b> | 📅 {dayjs(selectedViatico.fecha_inicio).format('DD/MM/YYYY')} al {dayjs(selectedViatico.fecha_fin).format('DD/MM/YYYY')}
              </div>
            </div>
          ) : 'Detalle de Comisión'
        }
        open={isDetailOpen}
        onCancel={() => {
          setIsDetailOpen(false);
          setInvoiceSearchText('');
        }}
        footer={null}
        width={1280}
        style={{ top: 20 }}
        styles={{ body: { padding: '16px 24px', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' } }}
        destroyOnClose
      >
        {selectedViatico && (
          <div style={{ marginTop: 8 }}>
            <Tabs activeKey={detailTab} onChange={setDetailTab}>
              {/* PESTAÑA 1: INFORMACIÓN GENERAL Y SOLICITUD */}
              <TabPane tab={<span><InfoCircleOutlined /> Información General</span>} key="general">
                <Row gutter={[20, 20]} style={{ marginTop: 12 }}>
                  {/* Columna Izquierda: Datos y Justificación */}
                  <Col xs={24} md={13}>
                    <Card size="small" title="Datos de la Comisión" style={{ borderRadius: 8, marginBottom: 16 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                        <div><b>Comisionado:</b> {selectedViatico.personal ? `${selectedViatico.personal.first_name} ${selectedViatico.personal.last_name}` : 'No asignado'}</div>
                        <div><b>Destino:</b> {selectedViatico.destino}</div>
                        <div><b>Periodo:</b> {dayjs(selectedViatico.fecha_inicio).format('DD/MM/YYYY')} al {dayjs(selectedViatico.fecha_fin).format('DD/MM/YYYY')}</div>
                        {selectedViatico.fecha_solicitud && (
                          <div><b>Fecha de Elaboración:</b> {dayjs(selectedViatico.fecha_solicitud).format('DD/MM/YYYY')}</div>
                        )}
                        <div><b>Cuenta Financiera:</b> {selectedViatico.account ? `${selectedViatico.account.name} (${selectedViatico.account.account_number})` : (selectedViatico.account_id || 'No asignada')}</div>
                        {selectedViatico.asistente && (
                          <div><b>Asistente Asignado:</b> {selectedViatico.asistente.full_name || selectedViatico.asistente.username}</div>
                        )}
                      </div>
                    </Card>

                    <Card size="small" title="Justificación / Motivo del Viaje" style={{ borderRadius: 8 }}>
                      <p style={{ margin: 0, color: '#333', lineHeight: 1.6, fontSize: 13 }}>
                        {selectedViatico.justificacion || 'Sin justificación registrada.'}
                      </p>
                      {selectedViatico.observaciones && (
                        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f0f0f0', fontSize: 12, color: '#666' }}>
                          <b>Observaciones:</b> {selectedViatico.observaciones}
                        </div>
                      )}
                    </Card>
                  </Col>

                  {/* Columna Derecha: Presupuesto Solicitado y Documento de Solicitud */}
                  <Col xs={24} md={11}>
                    <Card 
                      size="small" 
                      title="Presupuesto Solicitado" 
                      extra={<b style={{ color: '#1B4F72', fontSize: 15 }}>${(selectedViatico.monto_solicitado || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</b>}
                      style={{ borderRadius: 8, marginBottom: 16, background: '#F8FAFC' }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px dashed #E2E8F0' }}>
                          <span>🍔 Viáticos (37504):</span>
                          <b>${(selectedViatico.monto_viaticos || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px dashed #E2E8F0' }}>
                          <span>✈️ Pasaje Aéreo (37104):</span>
                          <b>${(selectedViatico.monto_pasaje_aereo || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px dashed #E2E8F0' }}>
                          <span>🏨 Hospedaje / Paquete (37504):</span>
                          <b>${(selectedViatico.monto_hospedaje_paquete || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px dashed #E2E8F0' }}>
                          <span>🚗 Arrendamiento Vehicular (32503):</span>
                          <b>${(selectedViatico.monto_arrendamiento_vehiculos || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px dashed #E2E8F0' }}>
                          <span>🚌 Pasaje Terrestre (37204):</span>
                          <b>${(selectedViatico.monto_pasaje_terrestre || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                          <span>⛽ Gasolina (26103):</span>
                          <b>${(selectedViatico.monto_gasolina || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b>
                        </div>
                      </div>
                    </Card>

                    <Card size="small" title="Documento de Solicitud Inicial" style={{ borderRadius: 8 }}>
                      {selectedViatico.solicitud_pdf_path ? (
                        <div>
                          <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Tag color="green">PDF CARGADO</Tag>
                            <span style={{ fontSize: 12, color: '#666' }}>Documento institucional</span>
                          </div>
                          <Space wrap style={{ width: '100%' }}>
                            <Button
                              type="primary"
                              ghost
                              icon={<FilePdfOutlined />}
                              href={getFileUrl(selectedViatico.solicitud_pdf_path)}
                              target="_blank"
                            >
                              Ver PDF de Solicitud
                            </Button>
                            {isAdmin && (
                              <Upload
                                accept=".pdf"
                                multiple={false}
                                beforeUpload={handleReplacePdf}
                                showUploadList={false}
                              >
                                <Button icon={<UploadOutlined />}>Reemplazar</Button>
                              </Upload>
                            )}
                          </Space>
                        </div>
                      ) : (
                        <div>
                          <div style={{ marginBottom: 8 }}><Tag color="orange">PENDIENTE</Tag></div>
                          {isAdmin && (
                            <Upload
                              accept=".pdf"
                              multiple={false}
                              beforeUpload={handleReplacePdf}
                              showUploadList={false}
                            >
                              <Button type="primary" icon={<UploadOutlined />}>Cargar Solicitud PDF</Button>
                            </Upload>
                          )}
                        </div>
                      )}
                    </Card>
                  </Col>
                </Row>
              </TabPane>

              {/* PESTAÑA 2: FACTURAS DE COMPROBACIÓN */}
              <TabPane tab={<span><DollarOutlined /> Facturas de Comprobación</span>} key="invoices">
                <div style={{ marginTop: 12 }}>
                  {(() => {
                    const solicitado = selectedViatico.monto_solicitado || 0;
                    const comprobado = selectedViatico.monto_comprobado || 0;
                    const diff = solicitado - comprobado;
                    const isDevolucion = diff > 0;
                    const isAFavor = diff < 0;

                    return (
                      <Row gutter={16} style={{ marginBottom: 16, alignItems: 'stretch' }}>
                        <Col span={8}>
                          <Card size="small" style={{ background: '#F8F9FA', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRadius: 8 }}>
                            <div>
                              <div style={{ fontSize: 12, color: '#7F8C8D' }}>Presupuesto Solicitado (Total)</div>
                              <div style={{ fontSize: 18, fontWeight: 'bold', color: '#2C3E50' }}>
                                ${solicitado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                              </div>
                            </div>
                            <div style={{ fontSize: 11, color: '#666', marginTop: 6, lineHeight: '1.4' }}>
                              <div>
                                Viáticos: <b>${(selectedViatico.monto_viaticos || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b> | 
                                Avión: <b>${(selectedViatico.monto_pasaje_aereo || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b> | 
                                Hotel: <b>${(selectedViatico.monto_hospedaje_paquete || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b>
                              </div>
                            </div>
                          </Card>
                        </Col>
                        <Col span={8}>
                          <Card size="small" style={{ background: '#E8F8F5', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRadius: 8 }}>
                            <div>
                              <div style={{ fontSize: 12, color: '#27AE60' }}>Monto Comprobado (Gastado)</div>
                              <div style={{ fontSize: 18, fontWeight: 'bold', color: '#27AE60' }}>
                                ${comprobado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                              </div>
                            </div>
                            <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
                              Facturas capturadas: <b>{selectedViatico.facturas?.length || 0}</b>
                            </div>
                          </Card>
                        </Col>
                        <Col span={8}>
                          <Card 
                            size="small" 
                            style={{ 
                              background: isDevolucion ? '#FEF9E7' : (isAFavor ? '#FDEDEC' : '#F4F6F7'), 
                              borderColor: isDevolucion ? '#F9E79F' : (isAFavor ? '#FADBD8' : '#D5D8DC'),
                              height: '100%',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              borderRadius: 8
                            }}
                          >
                            <div>
                              <div style={{ 
                                fontSize: 12, 
                                fontWeight: 600,
                                color: isDevolucion ? '#B7950B' : (isAFavor ? '#C0392B' : '#7F8C8D') 
                              }}>
                                {isDevolucion ? 'Monto a Regresar / Devolver' : (isAFavor ? 'Saldo a Favor del Usuario' : 'Diferencia (Saldo)')}
                              </div>
                              <div style={{ 
                                fontSize: 18, 
                                fontWeight: 'bold', 
                                color: isDevolucion ? '#D68910' : (isAFavor ? '#E74C3C' : '#27AE60') 
                              }}>
                                ${Math.abs(diff).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                              </div>
                            </div>
                            <div style={{ fontSize: 11, color: '#555', marginTop: 6 }}>
                              {isDevolucion && <span>⚠️ Reintegro pendiente</span>}
                              {isAFavor && <span>ℹ️ Se gastó más de lo presupuestado</span>}
                              {diff === 0 && <span>✅ Comprobación exacta sin saldo</span>}
                            </div>
                          </Card>
                        </Col>
                      </Row>
                    );
                  })()}

                  <Card 
                    size="small" 
                    title={<span style={{ fontSize: 13, color: '#1B4F72' }}>📊 Control por Partida Presupuestal</span>}
                    style={{ marginBottom: 16, background: '#FAFAFA', borderRadius: 8 }}
                  >
                    <Table 
                      dataSource={getCategoryComparison()}
                      pagination={false}
                      size="small"
                      rowKey="concept"
                      columns={[
                        {
                          title: 'Concepto / Rubro',
                          key: 'concept',
                          render: (_, r) => <span><span style={{ marginRight: 6 }}>{r.icon}</span><b>{r.concept}</b></span>
                        },
                        {
                          title: 'Presupuestado',
                          dataIndex: 'budget',
                          key: 'budget',
                          align: 'right',
                          render: (v) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
                        },
                        {
                          title: 'Comprobado (Facturas)',
                          dataIndex: 'spent',
                          key: 'spent',
                          align: 'right',
                          render: (v) => (
                            <span style={{ color: v > 0 ? '#1B4F72' : '#999', fontWeight: v > 0 ? 'bold' : 'normal' }}>
                              ${v.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                            </span>
                          )
                        },
                        {
                          title: 'Diferencia',
                          key: 'diff',
                          align: 'right',
                          render: (_, r) => {
                            const d = r.budget - r.spent;
                            const color = d > 0 ? '#27AE60' : d < 0 ? '#E74C3C' : '#95A5A6';
                            return (
                              <span style={{ color, fontWeight: 'bold' }}>
                                {d < 0 ? `-$${Math.abs(d).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : `$${d.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
                              </span>
                            );
                          }
                        }
                      ]}
                    />
                  </Card>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 'bold', color: '#0A2647' }}>Comprobantes Fiscales</span>
                      {selectedViatico.facturas && selectedViatico.facturas.length > 0 && (
                        <Tag color="blue" style={{ borderRadius: 10 }}>
                          {invoiceSearchText.trim()
                            ? `${filteredViaticoFacturas.length} de ${selectedViatico.facturas.length}`
                            : `${selectedViatico.facturas.length}`}
                        </Tag>
                      )}
                    </div>
                    <Space wrap>
                      <Input
                        placeholder="Buscar por proveedor, RFC o UUID..."
                        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                        value={invoiceSearchText}
                        onChange={(e) => setInvoiceSearchText(e.target.value)}
                        allowClear
                        style={{ width: 280 }}
                      />
                      {selectedViatico.facturas && selectedViatico.facturas.length > 0 && (
                        <>
                          <Button
                            icon={<FileExcelOutlined style={{ color: '#27AE60' }} />}
                            onClick={() => handleDownloadInvoicesExcel(selectedViatico.id)}
                            loading={downloadingExcel}
                          >
                            Descargar Excel
                          </Button>
                          <Button
                            icon={<FileZipOutlined style={{ color: '#E67E22' }} />}
                            onClick={() => handleDownloadInvoicesZip(selectedViatico.id)}
                            loading={downloadingZip}
                          >
                            Descargar Facturas (ZIP)
                          </Button>
                        </>
                      )}
                      {['borrador', 'comprobacion_pendiente', 'aprobado', 'solicitado'].includes(selectedViatico.status) && (
                        <Button
                          type="primary"
                          icon={<PlusOutlined />}
                          onClick={handleOpenInvoiceModal}
                        >
                          Cargar Factura XML / PDF
                        </Button>
                      )}
                    </Space>
                  </div>

                  <Table
                    dataSource={filteredViaticoFacturas}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    scroll={{ y: 350, x: 1050 }}
                    columns={[
                      {
                        title: 'UUID / Emisor',
                        key: 'emisor',
                        width: 240,
                        render: (_, r) => (
                          <div>
                            <small style={{ fontSize: 12 }}><b>{r.emisor_nombre || 'Sin emisor'}</b></small>
                            <br />
                            <small style={{ color: '#888' }}>
                              {r.emisor_rfc && <span>{r.emisor_rfc} • </span>}
                              {r.uuid ? (
                                <Tooltip title={`UUID: ${r.uuid}`}>
                                  <span style={{ cursor: 'help' }}>{r.uuid.substring(0, 18)}...</span>
                                </Tooltip>
                              ) : (
                                'Carga Manual'
                              )}
                            </small>
                          </div>
                        )
                      },
                      {
                        title: 'Fecha Emisión',
                        dataIndex: 'fecha_emision',
                        key: 'fecha_emision',
                        width: 170,
                        align: 'center',
                        sorter: (a, b) => dayjs(a.fecha_emision || 0).unix() - dayjs(b.fecha_emision || 0).unix(),
                        render: (val, r) => {
                          if (!val) return <span style={{ color: '#999' }}>—</span>;
                          const emision = dayjs(val);
                          const inicio = selectedViatico?.fecha_inicio ? dayjs(selectedViatico.fecha_inicio).startOf('day') : null;
                          const fin = selectedViatico?.fecha_fin ? dayjs(selectedViatico.fecha_fin).endOf('day') : null;
                          const isOutOfRange = (inicio && fin) && (emision.isBefore(inicio) || emision.isAfter(fin));
                          const dateFormatted = emision.format('DD/MM/YYYY');
                          const timeFormatted = emision.format('HH:mm');

                          if (isOutOfRange) {
                            const hasTicket = Boolean(r.ticket_filename);
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                <Tooltip
                                  title={
                                    <div>
                                      <div style={{ fontWeight: 600, color: hasTicket ? '#ffe58f' : '#ffccc7' }}>
                                        {hasTicket ? 'ℹ️ Fecha fuera de periodo (Justificada con ticket):' : '⚠️ Factura emitida fuera de periodo:'}
                                      </div>
                                      <div>Factura emitida el <b>{dateFormatted} {timeFormatted}</b>.</div>
                                      <div>Periodo de comisión: <b>{dayjs(selectedViatico.fecha_inicio).format('DD/MM/YYYY')}</b> al <b>{dayjs(selectedViatico.fecha_fin).format('DD/MM/YYYY')}</b>.</div>
                                      {hasTicket ? (
                                        <div style={{ marginTop: 4, color: '#87e8de', fontWeight: 600 }}>
                                          ✅ Cuenta con ticket o nota de consumo adjunto para justificar que el gasto se efectuó durante el viaje.
                                        </div>
                                      ) : (
                                        <div style={{ marginTop: 4, fontStyle: 'italic', fontSize: 11, color: '#fff' }}>
                                          Si el consumo fue durante la comisión, sube la foto o PDF del ticket para justificarlo.
                                        </div>
                                      )}
                                    </div>
                                  }
                                >
                                  <div style={{ 
                                    color: hasTicket ? '#d46b08' : '#cf1322', 
                                    fontWeight: 700, 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    gap: 4, 
                                    background: hasTicket ? '#fffbe6' : '#fff1f0', 
                                    padding: '2px 8px', 
                                    borderRadius: 6, 
                                    border: `1px solid ${hasTicket ? '#ffe58f' : '#ffa39e'}`,
                                    cursor: 'help'
                                  }}>
                                    <WarningOutlined style={{ color: hasTicket ? '#d46b08' : '#cf1322', fontSize: 13 }} />
                                    <span>{dateFormatted}</span>
                                  </div>
                                </Tooltip>

                                {hasTicket ? (
                                  <Tooltip title="Ver ticket / nota justificante">
                                    <a href={getFileUrl(r.ticket_filename)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                                      <Tag color="cyan" style={{ fontSize: 11, margin: 0, padding: '1px 6px', borderRadius: 4, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                        <FileImageOutlined /> Ticket Adjunto
                                      </Tag>
                                    </a>
                                  </Tooltip>
                                ) : (
                                  <Upload
                                    showUploadList={false}
                                    beforeUpload={(file) => handleUploadInvoiceTicket(r.id, file)}
                                    accept="image/*,.pdf"
                                  >
                                    <Tooltip title="Subir foto o PDF del ticket de compra para comprobar fecha del gasto">
                                      <Button 
                                        size="small" 
                                        type="dashed" 
                                        danger 
                                        icon={<CameraOutlined />} 
                                        loading={uploadingTicketForInv === r.id}
                                        style={{ fontSize: 11, height: 22, padding: '0 6px', borderRadius: 4 }}
                                      >
                                        Subir Ticket
                                      </Button>
                                    </Tooltip>
                                  </Upload>
                                )}
                              </div>
                            );
                          }

                          return (
                            <Tooltip title={`Emitida el ${dateFormatted} a las ${timeFormatted} (Dentro del periodo de comisión)`}>
                              <div style={{ color: '#1B4F72', fontWeight: 500 }}>
                                {dateFormatted}
                              </div>
                            </Tooltip>
                          );
                        }
                      },
                      {
                        title: 'Categoría',
                        dataIndex: 'category_id',
                        key: 'category_id',
                        width: 190,
                        render: (catId, r) => {
                          const viaticoCategories = categories.filter(c =>
                            ['alimentos', 'hospedaje', 'transporte', 'gasolina', 'avión', 'avion', 'paquete hospedaje + comida'].includes(c.name.toLowerCase())
                          );
                          return (
                            <Select
                              value={catId}
                              size="small"
                              style={{ width: '100%' }}
                              allowClear
                              placeholder="Sin categoría"
                              onChange={(newCatId) => handleUpdateInvoiceCategory(r.id, newCatId)}
                            >
                              {viaticoCategories.map(c => (
                                <Select.Option key={c.id} value={c.id}>
                                  {c.icon || '🏷️'} {c.name}
                                </Select.Option>
                              ))}
                            </Select>
                          );
                        }
                      },
                      {
                        title: 'Estado SAT',
                        dataIndex: 'sat_status',
                        key: 'sat_status',
                        width: 130,
                        align: 'center',
                        render: (status, record) => {
                          let color = 'default';
                          let label = status || 'No Verificado';
                          if (status === 'Vigente') color = 'green';
                          else if (status === 'Cancelado') color = 'red';
                          else if (status === 'Desconocido' || status === 'Error de Conexión') color = 'warning';
                          
                          return (
                            <Tooltip title={record.sat_verified_at ? `Verificado el: ${dayjs(record.sat_verified_at).format('DD-MM-YYYY HH:mm')}` : 'Sin verificación reciente'}>
                              <Tag color={color} style={{ fontWeight: 600 }}>{label.toUpperCase()}</Tag>
                            </Tooltip>
                          );
                        }
                      },
                      {
                        title: 'Total',
                        dataIndex: 'total',
                        key: 'total',
                        width: 120,
                        align: 'right',
                        render: (t) => <strong style={{ color: '#0A2647' }}>${t.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong>
                      },
                      {
                        title: 'Archivos',
                        key: 'archivos',
                        width: 155,
                        align: 'center',
                        render: (_, r) => (
                          <Space size="small" wrap style={{ justifyContent: 'center' }}>
                            {r.xml_filename ? (
                              <Tooltip title="Ver XML">
                                <Button
                                  size="small"
                                  icon={<FileTextOutlined />}
                                  href={getFileUrl(r.xml_filename)}
                                  target="_blank"
                                />
                              </Tooltip>
                            ) : (
                              <Tooltip title="⚠️ Falta archivo XML fiscal. Haz clic para subirlo y validarlo">
                                <Upload
                                  showUploadList={false}
                                  beforeUpload={(file) => handleUploadInvoiceXml(r.id, file)}
                                  accept=".xml"
                                >
                                  <Button
                                    size="small"
                                    type="dashed"
                                    danger
                                    icon={<FileTextOutlined style={{ color: '#ff4d4f' }} />}
                                    loading={uploadingXmlForInv === r.id}
                                    style={{
                                      color: '#cf1322',
                                      borderColor: '#ffa39e',
                                      background: '#fff1f0',
                                      padding: '0 6px',
                                      height: 24,
                                      fontSize: 11,
                                      fontWeight: 600
                                    }}
                                  >
                                    + XML
                                  </Button>
                                </Upload>
                              </Tooltip>
                            )}

                            {r.pdf_filename ? (
                              <Tooltip title="Ver PDF">
                                <Button
                                  size="small"
                                  icon={<FilePdfOutlined style={{ color: '#cf1322' }} />}
                                  href={getFileUrl(r.pdf_filename)}
                                  target="_blank"
                                />
                              </Tooltip>
                            ) : (
                              <Tooltip title="⚠️ Falta archivo PDF. Haz clic para subirlo y verificar correspondencia">
                                <Upload
                                  showUploadList={false}
                                  beforeUpload={(file) => handleUploadInvoicePdf(r.id, file)}
                                  accept=".pdf"
                                >
                                  <Button
                                    size="small"
                                    type="dashed"
                                    danger
                                    icon={<FilePdfOutlined style={{ color: '#ff4d4f' }} />}
                                    loading={uploadingPdfForInv === r.id}
                                    style={{
                                      color: '#cf1322',
                                      borderColor: '#ffa39e',
                                      background: '#fff1f0',
                                      padding: '0 6px',
                                      height: 24,
                                      fontSize: 11,
                                      fontWeight: 600
                                    }}
                                  >
                                    + PDF
                                  </Button>
                                </Upload>
                              </Tooltip>
                            )}

                            {r.ticket_filename && (
                              <Space size={1}>
                                <Tooltip title="Ver Ticket / Justificante adjunto">
                                  <Button
                                    size="small"
                                    icon={<FileImageOutlined style={{ color: '#0958d9' }} />}
                                    href={getFileUrl(r.ticket_filename)}
                                    target="_blank"
                                    style={{ borderColor: '#91caff', background: '#e6f4ff' }}
                                  />
                                </Tooltip>
                                <Popconfirm
                                  title="¿Eliminar el ticket adjunto?"
                                  onConfirm={() => handleDeleteInvoiceTicket(r.id)}
                                  okText="Sí"
                                  cancelText="No"
                                >
                                  <Tooltip title="Quitar ticket adjunto">
                                    <Button
                                      size="small"
                                      type="text"
                                      danger
                                      icon={<CloseCircleOutlined style={{ fontSize: 11 }} />}
                                      style={{ width: 14, minWidth: 14, padding: 0 }}
                                    />
                                  </Tooltip>
                                </Popconfirm>
                              </Space>
                            )}
                            {r.uuid && (
                              <Tooltip title="Re-verificar ante el SAT">
                                <Button
                                  icon={<SyncOutlined />}
                                  size="small"
                                  onClick={() => handleVerifySat(r.id)}
                                />
                              </Tooltip>
                            )}
                          </Space>
                        )
                      },
                      {
                        title: 'Acciones',
                        key: 'delete',
                        width: 70,
                        align: 'center',
                        render: (_, r) => (
                          <Popconfirm
                            title="¿Eliminar esta factura?"
                            onConfirm={() => handleDeleteInvoice(r.id)}
                            okText="Sí"
                            cancelText="No"
                          >
                            <Tooltip title="Eliminar factura">
                              <Button icon={<DeleteOutlined />} size="small" danger type="text" />
                            </Tooltip>
                          </Popconfirm>
                        )
                      }
                    ]}
                  />
                </div>
              </TabPane>

              {/* PESTAÑA 3: EXPEDIENTE Y CIERRE */}
              <TabPane tab={<span><FolderOpenOutlined /> Expediente y Cierre</span>} key="expediente">
                <div style={{ marginTop: 12 }}>
                  <Alert
                    message="Control del Expediente de Comprobación y Cierre"
                    description="Para cerrar y liquidar formalmente la comisión de viáticos, sube los documentos oficiales requeridos (Comprobación EPISA, Reporte de Actividades y Comprobante de Reintegro si aplica)."
                    type="info"
                    showIcon
                    style={{ marginBottom: 20, borderRadius: 8 }}
                  />

                  <Row gutter={[16, 16]}>
                    {/* DOC 1: SOLICITUD */}
                    <Col xs={24} sm={12}>
                      <Card 
                        size="small" 
                        title={<span style={{ fontWeight: 600 }}>1. Solicitud Oficial de Viáticos</span>}
                        style={{ height: '100%', borderRadius: 8, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                      >
                        <div style={{ marginBottom: 16 }}>
                          <p style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>
                            Formato de solicitud de recursos emitido previo a la salida de la comisión.
                          </p>
                          {selectedViatico.solicitud_pdf_path ? (
                            <Tag color="green" style={{ fontSize: 12, padding: '2px 8px' }}>DOCUMENTO CARGADO</Tag>
                          ) : (
                            <Tag color="orange" style={{ fontSize: 12, padding: '2px 8px' }}>PENDIENTE</Tag>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', flexWrap: 'wrap' }}>
                          {selectedViatico.solicitud_pdf_path && (
                            <Button
                              type="primary"
                              ghost
                              icon={<FilePdfOutlined />}
                              href={getFileUrl(selectedViatico.solicitud_pdf_path)}
                              target="_blank"
                            >
                              Ver PDF
                            </Button>
                          )}
                          {isAdmin && (
                            <Upload
                              accept=".pdf"
                              multiple={false}
                              beforeUpload={handleReplacePdf}
                              showUploadList={false}
                            >
                              <Button icon={<UploadOutlined />}>
                                {selectedViatico.solicitud_pdf_path ? 'Reemplazar' : 'Subir PDF'}
                              </Button>
                            </Upload>
                          )}
                          {selectedViatico.solicitud_pdf_path && (
                            <Popconfirm
                              title="¿Eliminar PDF de solicitud?"
                              description="Se restablecerán las firmas asociadas a esta solicitud."
                              onConfirm={() => handleClearFile('solicitud')}
                              okText="Sí"
                              cancelText="No"
                            >
                              <Button icon={<DeleteOutlined />} danger type="text" />
                            </Popconfirm>
                          )}
                        </div>
                      </Card>
                    </Col>

                    {/* DOC 2: COMPROBACIÓN EPISA */}
                    <Col xs={24} sm={12}>
                      <Card 
                        size="small" 
                        title={<span style={{ fontWeight: 600 }}>2. Reporte de Comprobación EPISA</span>}
                        style={{ height: '100%', borderRadius: 8, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                      >
                        <div style={{ marginBottom: 16 }}>
                          <p style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>
                            Documento oficial generado en el sistema EPISA con liquidación y firmas de revisión.
                          </p>
                          {selectedViatico.comprobacion_pdf_path ? (
                            <Tag color="green" style={{ fontSize: 12, padding: '2px 8px' }}>COMPROBACIÓN CARGADA</Tag>
                          ) : (
                            <Tag color="orange" style={{ fontSize: 12, padding: '2px 8px' }}>PENDIENTE DE SUBIR</Tag>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', flexWrap: 'wrap' }}>
                          {selectedViatico.comprobacion_pdf_path && (
                            <Button
                              type="primary"
                              ghost
                              icon={<FilePdfOutlined />}
                              href={getFileUrl(selectedViatico.comprobacion_pdf_path)}
                              target="_blank"
                            >
                              Ver Comprobación
                            </Button>
                          )}
                          <Upload
                            accept=".pdf"
                            multiple={false}
                            beforeUpload={handleUploadComprobacionPdf}
                            showUploadList={false}
                          >
                            <Button 
                              type={selectedViatico.comprobacion_pdf_path ? "default" : "primary"}
                              icon={<UploadOutlined />} 
                              loading={uploadingComprobacion}
                            >
                              {selectedViatico.comprobacion_pdf_path ? 'Actualizar EPISA' : 'Subir Comprobación EPISA'}
                            </Button>
                          </Upload>
                          {selectedViatico.comprobacion_pdf_path && (
                            <Popconfirm
                              title="¿Eliminar comprobación EPISA?"
                              description="Se restablecerán las firmas de seguimiento asociadas."
                              onConfirm={() => handleClearFile('comprobacion')}
                              okText="Sí"
                              cancelText="No"
                            >
                              <Button icon={<DeleteOutlined />} danger type="text" />
                            </Popconfirm>
                          )}
                        </div>
                      </Card>
                    </Col>

                    {/* DOC 3: REPORTE DE ACTIVIDADES */}
                    <Col xs={24} sm={12}>
                      <Card 
                        size="small" 
                        title={<span style={{ fontWeight: 600 }}>3. Reporte de Actividades / Informe</span>}
                        style={{ height: '100%', borderRadius: 8, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                      >
                        <div style={{ marginBottom: 16 }}>
                          <p style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>
                            Informe técnico detallando las actividades y objetivos cumplidos durante el viaje.
                          </p>
                          {selectedViatico.reporte_pdf_path ? (
                            <Tag color="green" style={{ fontSize: 12, padding: '2px 8px' }}>REPORTE CARGADO</Tag>
                          ) : (
                            <Tag color="orange" style={{ fontSize: 12, padding: '2px 8px' }}>PENDIENTE</Tag>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', flexWrap: 'wrap' }}>
                          {selectedViatico.reporte_pdf_path && (
                            <Button
                              type="primary"
                              ghost
                              icon={<FileTextOutlined />}
                              href={getFileUrl(selectedViatico.reporte_pdf_path)}
                              target="_blank"
                            >
                              Ver Reporte PDF
                            </Button>
                          )}
                          <Upload
                            accept=".pdf"
                            multiple={false}
                            beforeUpload={handleUploadReportePdf}
                            showUploadList={false}
                          >
                            <Button icon={<UploadOutlined />} loading={uploadingReporte}>
                              {selectedViatico.reporte_pdf_path ? 'Reemplazar' : 'Subir Reporte PDF'}
                            </Button>
                          </Upload>
                          {selectedViatico.reporte_pdf_path && (
                            <Popconfirm
                              title="¿Eliminar reporte de actividades?"
                              onConfirm={() => handleClearFile('reporte')}
                              okText="Sí"
                              cancelText="No"
                            >
                              <Button icon={<DeleteOutlined />} danger type="text" />
                            </Popconfirm>
                          )}
                        </div>
                      </Card>
                    </Col>

                    {/* DOC 4: REINTEGRO / DEVOLUCIÓN */}
                    <Col xs={24} sm={12}>
                      <Card 
                        size="small" 
                        title={<span style={{ fontWeight: 600 }}>4. Reintegro / Ficha de Devolución</span>}
                        style={{ height: '100%', borderRadius: 8, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                      >
                        <div style={{ marginBottom: 16 }}>
                          <p style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>
                            Comprobante bancario o recibo de tesorería institucional por el remanente no ejercido.
                          </p>
                          {selectedViatico.comprobante_devolucion_path ? (
                            <Tag color="green" style={{ fontSize: 12, padding: '2px 8px' }}>
                              DEVUELTO: ${(selectedViatico.monto_devuelto || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                            </Tag>
                          ) : (
                            <div>
                              {(selectedViatico.monto_devuelto > 0 || (selectedViatico.monto_solicitado - selectedViatico.monto_comprobado) > 0) ? (
                                <Tag color="volcano" style={{ fontSize: 12, padding: '2px 8px' }}>
                                  REMANENTE REQUERIDO: ${(selectedViatico.monto_devuelto || Math.max(0, selectedViatico.monto_solicitado - selectedViatico.monto_comprobado)).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                                </Tag>
                              ) : (
                                <Tag color="default" style={{ fontSize: 12, padding: '2px 8px' }}>NO REQUERIDO (SIN SALDO)</Tag>
                              )}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', flexWrap: 'wrap' }}>
                          {selectedViatico.comprobante_devolucion_path && (
                            <Button
                              type="primary"
                              ghost
                              icon={<FileTextOutlined />}
                              href={getFileUrl(selectedViatico.comprobante_devolucion_path)}
                              target="_blank"
                            >
                              Ver Ficha
                            </Button>
                          )}
                          <Button 
                            type={(selectedViatico.monto_devuelto > 0 || (selectedViatico.monto_solicitado - selectedViatico.monto_comprobado) > 0) && !selectedViatico.comprobante_devolucion_path ? "primary" : "default"}
                            danger={(selectedViatico.monto_devuelto > 0 || (selectedViatico.monto_solicitado - selectedViatico.monto_comprobado) > 0) && !selectedViatico.comprobante_devolucion_path}
                            icon={<UploadOutlined />} 
                            onClick={handleOpenDevolucionModal}
                          >
                            {selectedViatico.comprobante_devolucion_path ? 'Actualizar Ficha' : 'Registrar Ficha de Devolución'}
                          </Button>
                          {selectedViatico.comprobante_devolucion_path && (
                            <Popconfirm
                              title="¿Eliminar comprobante de devolución?"
                              onConfirm={() => handleClearFile('devolucion')}
                              okText="Sí"
                              cancelText="No"
                            >
                              <Button icon={<DeleteOutlined />} danger type="text" />
                            </Popconfirm>
                          )}
                        </div>
                      </Card>
                    </Col>
                  </Row>
                </div>
              </TabPane>

              {/* PESTAÑA 4: FIRMAS Y AUDITORÍA */}
              <TabPane tab={<span><SafetyCertificateOutlined /> Firmas y Auditoría</span>} key="signatures">
                <div style={{ marginTop: 12 }}>
                  <Row gutter={[20, 20]}>
                    <Col xs={24} md={12}>
                      <Card
                        size="small"
                        title={<span style={{ color: '#1B4F72', fontSize: 14, fontWeight: 600 }}>🛫 1. Autorización y Pago (Solicitud)</span>}
                        style={{ borderRadius: 8, background: '#FAFAFA' }}
                      >
                        {renderSolicitudTimeline(selectedViatico)}
                      </Card>
                    </Col>

                    <Col xs={24} md={12}>
                      <Card
                        size="small"
                        title={<span style={{ color: '#0E6251', fontSize: 14, fontWeight: 600 }}>🏁 2. Liquidación y Cierre (Comprobación EPISA)</span>}
                        style={{ borderRadius: 8, background: '#FAFAFA' }}
                      >
                        {renderComprobacionTimeline(selectedViatico)}
                      </Card>
                    </Col>
                  </Row>

                  {/* Hashes Criptográficos de Auditoría */}
                  <Card 
                    size="small" 
                    title={<span style={{ color: '#555', fontSize: 13, fontWeight: 600 }}>🔒 Hashes Criptográficos de Auditoría</span>}
                    style={{ marginTop: 20, borderRadius: 8 }}
                  >
                    <Row gutter={[16, 16]}>
                      <Col xs={24} md={12}>
                        <div style={{ fontWeight: 600, color: '#1B4F72', marginBottom: 8, fontSize: 12 }}>
                          Firmas de Solicitud Inicial:
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {[
                            { label: 'Solicitante', hash: selectedViatico.firma_solicitante_hash },
                            { label: 'Resp. Cuenta / Jefe', hash: selectedViatico.firma_jefe_hash || selectedViatico.firma_responsable_hash },
                            { label: 'Revisor Administrativo', hash: selectedViatico.firma_revisor_hash },
                            { label: 'Ventanilla Tesorería', hash: selectedViatico.firma_tesoreria_hash },
                          ].map((s, idx) => (
                            <div key={idx} style={{ fontSize: 11, background: '#f8f9fa', padding: '4px 8px', borderRadius: 4, border: '1px solid #e9ecef' }}>
                              <b>{s.label}:</b> <span style={{ fontFamily: 'monospace', color: s.hash ? '#333' : '#999', wordBreak: 'break-all' }}>{s.hash || 'Pendiente'}</span>
                            </div>
                          ))}
                        </div>
                      </Col>

                      <Col xs={24} md={12}>
                        <div style={{ fontWeight: 600, color: '#0E6251', marginBottom: 8, fontSize: 12 }}>
                          Firmas de Comprobación EPISA:
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {[
                            { label: 'Resp. Cuenta / Solicitante', hash: selectedViatico.firma_comp_solicitante_hash },
                            { label: 'Revisor Administrativo', hash: selectedViatico.firma_comp_revisor_hash },
                            { label: 'Ventanilla Tesorería', hash: selectedViatico.firma_comp_tesoreria_hash },
                            { label: 'Ventanilla Contabilidad', hash: selectedViatico.firma_comp_contabilidad_hash },
                          ].map((s, idx) => (
                            <div key={idx} style={{ fontSize: 11, background: '#f8f9fa', padding: '4px 8px', borderRadius: 4, border: '1px solid #e9ecef' }}>
                              <b>{s.label}:</b> <span style={{ fontFamily: 'monospace', color: s.hash ? '#333' : '#999', wordBreak: 'break-all' }}>{s.hash || 'Pendiente'}</span>
                            </div>
                          ))}
                        </div>
                      </Col>
                    </Row>
                  </Card>
                </div>
              </TabPane>
            </Tabs>
          </div>
        )}
      </Modal>

      {/* Modal Registrar Devolución / Reintegro */}
      <Modal
        title={<span style={{ color: '#0A2647', fontWeight: 600 }}>💳 Registrar Comprobante de Devolución / Reintegro</span>}
        open={isDevolucionModalOpen}
        onCancel={() => {
          setIsDevolucionModalOpen(false);
          devolucionForm.resetFields();
        }}
        onOk={() => devolucionForm.submit()}
        okText="Guardar y Liquidar"
        cancelText="Cancelar"
        confirmLoading={uploadingDevolucion}
        destroyOnClose
        width={600}
      >
        <Form
          form={devolucionForm}
          layout="vertical"
          onFinish={handleUploadDevolucion}
          style={{ marginTop: 16 }}
        >
          <Alert
            message="Comprobante de Reintegro a Tesorería"
            description="Adjunta la ficha de depósito bancario, transferencia o recibo de tesorería institucional que acredita la devolución del remanente no ejercido."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Form.Item
            name="monto_devuelto"
            label="Monto Devuelto ($ MXN)"
            rules={[{ required: true, message: 'Ingresa el monto devuelto' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              precision={2}
              min={0}
              step={0.01}
              formatter={value => {
                if (value === null || value === undefined || value === '') return '';
                const parts = `${value}`.split('.');
                parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                return `$ ${parts.join('.')}`;
              }}
              parser={value => (value ? value.replace(/\$\s?|(,*)/g, '') : '')}
            />
          </Form.Item>

          <Form.Item
            name="comprobante_file"
            label="Archivo del Comprobante (PDF o Imagen JPG / PNG)"
            rules={[{ required: true, message: 'Selecciona el archivo del comprobante' }]}
          >
            <Upload.Dragger
              accept=".pdf,.jpg,.jpeg,.png"
              multiple={false}
              beforeUpload={() => false}
              maxCount={1}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ color: '#1B4F72' }} />
              </p>
              <p className="ant-upload-text">Haz clic o arrastra el archivo aquí</p>
              <p className="ant-upload-hint">Formatos soportados: PDF, JPG, PNG</p>
            </Upload.Dragger>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Cargar Factura */}
      <Modal
        title={<span style={{ color: '#0A2647', fontWeight: 600 }}>Cargar Facturas XML / PDF (Viáticos)</span>}
        open={isInvoiceModalOpen}
        onCancel={() => setIsInvoiceModalOpen(false)}
        onOk={handleUploadInvoice}
        okText="Subir y Validar"
        cancelText="Cancelar"
        destroyOnClose
        width={1000}
        confirmLoading={isUploadingMulti}
      >
        <Form form={invoiceForm} layout="vertical" style={{ marginTop: 16 }}>
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
                    title: 'Categoría',
                    key: 'category_id',
                    width: 180,
                    render: (_, record) => {
                      if (record.status === 'orphan') return 'N/A';
                      const viaticoCategories = categories.filter(c =>
                        ['alimentos', 'hospedaje', 'transporte', 'gasolina', 'avión', 'avion', 'paquete hospedaje + comida'].includes(c.name.toLowerCase())
                      );
                      return (
                        <Select
                          placeholder="Sin categoría"
                          size="small"
                          style={{ width: '100%' }}
                          allowClear
                          value={record.category_id}
                          onChange={(val) => {
                            const updated = matchedInvoices.map(item =>
                              item.key === record.key ? { ...item, category_id: val } : item
                            );
                            setMatchedInvoices(updated);
                          }}
                        >
                          {viaticoCategories.map(c => (
                            <Select.Option key={c.id} value={c.id}>
                              {c.icon || '🏷️'} {c.name}
                            </Select.Option>
                          ))}
                        </Select>
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
                    width: 50,
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

          <Form.Item name="description" label="Descripción / Observación Genérica">
            <Input placeholder="Ej. Gastos de alimentación y hospedaje de la comisión..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
