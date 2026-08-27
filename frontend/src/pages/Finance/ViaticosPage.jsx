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
  CloseOutlined,
  FileZipOutlined
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
  const [detailTab, setDetailTab] = useState('signatures');
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [invoiceForm] = Form.useForm();
  const [xmlFileList, setXmlFileList] = useState([]);
  const [pdfFileList, setPdfFileList] = useState([]);
  
  // Bulk Invoice upload states
  const [matchedInvoices, setMatchedInvoices] = useState([]);
  const [processingFiles, setProcessingFiles] = useState(false);
  const [isUploadingMulti, setIsUploadingMulti] = useState(false);

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
    } catch (error) {
      message.error('Error al descargar el archivo ZIP de facturas.');
    }
  };

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

  // Renderizar la línea de tiempo de firmas
  const renderSignatureTimeline = (v) => {
    const steps = [
      {
        title: '1. Solicitante / Comisionado',
        name: v.firma_solicitante_nombre,
        fecha: v.firma_solicitante_fecha,
        hash: v.firma_solicitante_hash,
        role: 'Comisionado'
      },
      {
        title: '2. Jefe Inmediato',
        name: v.firma_jefe_nombre,
        fecha: v.firma_jefe_fecha,
        hash: v.firma_jefe_hash,
        role: 'Jefe Inmediato'
      },
      {
        title: '3. Encargado / Responsable de Cuenta',
        name: v.firma_responsable_nombre,
        fecha: v.firma_responsable_fecha,
        hash: v.firma_responsable_hash,
        role: 'Responsable'
      },
      {
        title: '4. Revisor Administrativo',
        name: v.firma_revisor_nombre,
        fecha: v.firma_revisor_fecha,
        hash: v.firma_revisor_hash,
        role: 'Administración'
      },
      {
        title: '5. Ventanilla de Tesorería (Pago)',
        name: v.firma_tesoreria_nombre,
        fecha: v.firma_tesoreria_fecha,
        hash: v.firma_tesoreria_hash,
        role: 'Tesorería'
      }
    ];

    return (
      <Timeline style={{ marginTop: 24 }}>
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
                    Pendiente de firma en el documento oficial
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
      render: (text, record) => <a onClick={() => handleOpenDetail(record)}><b>{text}</b></a>
    },
    {
      title: 'Comisionado',
      dataIndex: 'personal',
      key: 'personal',
      render: (p) => p ? `${p.first_name} ${p.last_name}` : 'No asignado'
    },
    {
      title: 'Destino',
      dataIndex: 'destino',
      key: 'destino'
    },
    {
      title: 'Fecha Inicio',
      dataIndex: 'fecha_inicio',
      key: 'fecha_inicio',
      render: (d) => dayjs(d).format('DD/MM/YYYY')
    },
    {
      title: 'Monto Solicitado',
      dataIndex: 'monto_solicitado',
      key: 'monto_solicitado',
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
      render: (status) => {
        const config = STATUS_MAP[status] || { label: status, color: 'default' };
        return <Tag color={config.color}>{config.label}</Tag>;
      }
    },
    {
      title: 'Acciones',
      key: 'acciones',
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

      {/* Modal Detalle de Comisión, Timeline y Facturas */}
      <Modal
        title={
          <span style={{ fontSize: 18, color: '#0A2647', fontWeight: 600 }}>
            ✈️ Detalle de Comisión: {selectedViatico?.folio_comision}
          </span>
        }
        open={isDetailOpen}
        onCancel={() => setIsDetailOpen(false)}
        footer={null}
        width={1100}
        destroyOnClose
      >
        {selectedViatico && (
          <div style={{ marginTop: 8 }}>
            <Tabs activeKey={detailTab} onChange={setDetailTab}>
              {/* PESTAÑA 1: FIRMAS Y TIEMPOS */}
              <TabPane tab={<span><ClockCircleOutlined /> Firmas y Tiempos</span>} key="signatures">
                <Row gutter={[24, 24]} style={{ marginTop: 12 }}>
                  <Col span={12}>
                    <Card size="small" title="Información General de la Comisión" style={{ marginBottom: 16 }}>
                      <p><b>Comisionado:</b> {selectedViatico.personal ? `${selectedViatico.personal.first_name} ${selectedViatico.personal.last_name}` : 'No asignado'}</p>
                      <p><b>Destino:</b> {selectedViatico.destino}</p>
                      <p><b>Periodo:</b> {dayjs(selectedViatico.fecha_inicio).format('DD/MM/YYYY')} al {dayjs(selectedViatico.fecha_fin).format('DD/MM/YYYY')}</p>
                      <p style={{ marginBottom: 4 }}><b>Presupuesto Solicitado (Total):</b> ${selectedViatico.monto_solicitado.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</p>
                      <div style={{ marginLeft: 12, marginBottom: 12, fontSize: '12px', color: '#666', lineHeight: '1.7' }}>
                        <Row>
                          <Col span={12}>
                            <div>• Viáticos (37504): <b>${(selectedViatico.monto_viaticos || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b> MXN</div>
                            <div>• Avión (37104): <b>${(selectedViatico.monto_pasaje_aereo || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b> MXN</div>
                            <div>• Hotel / Paquete (37504): <b>${(selectedViatico.monto_hospedaje_paquete || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b> MXN</div>
                          </Col>
                          <Col span={12}>
                            <div>• Renta Vehículo (32503): <b>${(selectedViatico.monto_arrendamiento_vehiculos || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b> MXN</div>
                            <div>• Pasaje Terrestre (37204): <b>${(selectedViatico.monto_pasaje_terrestre || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b> MXN</div>
                            <div>• Gasolina (26103): <b>${(selectedViatico.monto_gasolina || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b> MXN</div>
                          </Col>
                        </Row>
                      </div>
                      
                      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                        {selectedViatico.solicitud_pdf_path && (
                          <Button
                            type="primary"
                            ghost
                            icon={<FilePdfOutlined />}
                            href={getFileUrl(selectedViatico.solicitud_pdf_path)}
                            target="_blank"
                          >
                            Ver Solicitud PDF
                          </Button>
                        )}
                        {isAdmin && (
                          <Upload
                            accept=".pdf"
                            multiple={false}
                            beforeUpload={handleReplacePdf}
                            showUploadList={false}
                          >
                            <Button icon={<UploadOutlined />}>Reemplazar PDF</Button>
                          </Upload>
                        )}
                      </div>
                    </Card>
                    
                    <Alert
                      message="Justificación de Comisión"
                      description={selectedViatico.justificacion}
                      type="info"
                      showIcon
                    />
                  </Col>
                  
                  <Col span={12}>
                    <Card
                      size="small"
                      title={<span style={{ color: '#0A2647', fontSize: 14, fontWeight: 600 }}>🔏 Historial y Seguimiento de Firmas</span>}
                      bordered
                      style={{ background: '#fafafa' }}
                    >
                      {renderSignatureTimeline(selectedViatico)}
                    </Card>
                  </Col>
                </Row>
              </TabPane>

              {/* PESTAÑA 2: FACTURAS DE COMPROBACIÓN */}
              <TabPane tab={<span><DollarOutlined /> Facturas de Comprobación</span>} key="invoices">
                <div style={{ marginTop: 12 }}>
                  <Row gutter={16} style={{ marginBottom: 16 }}>
                    <Col span={12}>
                      <Card size="small" style={{ background: '#F8F9FA' }}>
                        <div style={{ fontSize: 12, color: '#7F8C8D' }}>Presupuesto Solicitado (Total)</div>
                        <div style={{ fontSize: 18, fontWeight: 'bold', color: '#2C3E50' }}>
                          ${selectedViatico.monto_solicitado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: 11, color: '#666', marginTop: 4, lineHeight: '1.5' }}>
                          <div>
                            Viáticos: <b>${(selectedViatico.monto_viaticos || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b> | 
                            Avión: <b>${(selectedViatico.monto_pasaje_aereo || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b> | 
                            Hotel: <b>${(selectedViatico.monto_hospedaje_paquete || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b>
                          </div>
                          <div>
                            Renta Auto: <b>${(selectedViatico.monto_arrendamiento_vehiculos || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b> | 
                            Terrestre: <b>${(selectedViatico.monto_pasaje_terrestre || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b> | 
                            Gasolina: <b>${(selectedViatico.monto_gasolina || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b>
                          </div>
                        </div>
                      </Card>
                    </Col>
                    <Col span={12}>
                      <Card size="small" style={{ background: '#E8F8F5' }}>
                        <div style={{ fontSize: 12, color: '#27AE60' }}>Monto Comprobado</div>
                        <div style={{ fontSize: 18, fontWeight: 'bold', color: '#27AE60' }}>
                          ${selectedViatico.monto_comprobado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </div>
                      </Card>
                    </Col>
                  </Row>

                  <Card 
                    size="small" 
                    title={<span style={{ color: '#0A2647', fontSize: 13, fontWeight: 600 }}>📊 Control de Presupuesto por Categoría (Solicitado vs Comprobado)</span>}
                    style={{ marginBottom: 20, background: '#fafafa', border: '1px solid #E2E8F0' }}
                  >
                    <Table
                      size="small"
                      pagination={false}
                      dataSource={getCategoryComparison()}
                      rowKey="concept"
                      columns={[
                        {
                          title: 'Concepto / Rubro',
                          dataIndex: 'concept',
                          key: 'concept',
                          render: (text, r) => <span>{r.icon} {text}</span>
                        },
                        {
                          title: 'Solicitado (Presupuesto)',
                          dataIndex: 'budget',
                          key: 'budget',
                          render: (v) => <b>${v.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b>
                        },
                        {
                          title: 'Comprobado (Gastado)',
                          dataIndex: 'spent',
                          key: 'spent',
                          render: (v) => (
                            <span style={{ color: v > 0 ? '#1B4F72' : '#8c8c8c', fontWeight: v > 0 ? 500 : 'normal' }}>
                              ${v.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                            </span>
                          )
                        },
                        {
                          title: 'Diferencia (Saldo)',
                          key: 'diff',
                          render: (_, r) => {
                            const diff = r.budget - r.spent;
                            const isOver = diff < 0;
                            return (
                              <span style={{ 
                                fontWeight: 'bold', 
                                color: isOver ? '#E74C3C' : (diff === 0 ? '#8c8c8c' : '#27AE60') 
                              }}>
                                {isOver ? '-' : ''}${Math.abs(diff).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                              </span>
                            );
                          }
                        }
                      ]}
                    />
                  </Card>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 15, fontWeight: 'bold', color: '#0A2647' }}>Comprobantes Fiscales</span>
                    <Space>
                      {selectedViatico.facturas && selectedViatico.facturas.length > 0 && (
                        <Button
                          icon={<FileZipOutlined style={{ color: '#E67E22' }} />}
                          onClick={() => handleDownloadInvoicesZip(selectedViatico.id)}
                        >
                          Descargar Facturas (ZIP)
                        </Button>
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
                    dataSource={selectedViatico.facturas}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    scroll={{ y: 280 }}
                    columns={[
                      {
                        title: 'UUID / Emisor',
                        key: 'emisor',
                        render: (_, r) => (
                          <div>
                            <small><b>{r.emisor_nombre}</b></small>
                            <br />
                            <small style={{ color: '#999' }}>{r.uuid ? r.uuid.substring(0, 18) + '...' : 'Carga Manual'}</small>
                          </div>
                        )
                      },
                      {
                        title: 'Categoría',
                        dataIndex: 'category_id',
                        key: 'category_id',
                        width: 180,
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
                        title: 'Total',
                        dataIndex: 'total',
                        key: 'total',
                        render: (t) => `$${t.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
                      },
                      {
                        title: 'Archivos',
                        key: 'archivos',
                        render: (_, r) => (
                          <Space>
                            {r.xml_filename && (
                              <Button
                                icon={<FileTextOutlined style={{ color: '#1B4F72' }} />}
                                size="small"
                                href={getFileUrl(r.xml_filename)}
                                target="_blank"
                                title="Descargar XML"
                              />
                            )}
                            {r.pdf_filename && (
                              <Button
                                icon={<FilePdfOutlined style={{ color: '#ff4d4f' }} />}
                                size="small"
                                href={getFileUrl(r.pdf_filename)}
                                target="_blank"
                                title="Descargar PDF"
                              />
                            )}
                            {r.uuid && (
                              <Button
                                icon={<SyncOutlined />}
                                size="small"
                                onClick={() => handleVerifySat(r.id)}
                                title="Verificar ante el SAT"
                              />
                            )}
                          </Space>
                        )
                      },
                      {
                        title: 'Acciones',
                        key: 'delete',
                        render: (_, r) => (
                          <Popconfirm
                            title="¿Eliminar esta factura?"
                            onConfirm={() => handleDeleteInvoice(r.id)}
                            okText="Sí"
                            cancelText="No"
                          >
                            <Button icon={<DeleteOutlined />} size="small" danger type="text" />
                          </Popconfirm>
                        )
                      }
                    ]}
                  />
                </div>
              </TabPane>

              {/* PESTAÑA 3: HASHES DE FIRMAS */}
              <TabPane tab={<span><CheckOutlined /> Hashes de Firmas</span>} key="signature_hashes">
                <Card size="small" title="Historial Criptográfico de Firmas (Auditoría)" style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {[
                      { label: 'Solicitante / Comisionado', nombre: selectedViatico.firma_solicitante_nombre, fecha: selectedViatico.firma_solicitante_fecha, hash: selectedViatico.firma_solicitante_hash },
                      { label: 'Responsable de Cuenta / Jefe Inmediato', nombre: selectedViatico.firma_jefe_nombre, fecha: selectedViatico.firma_jefe_fecha, hash: selectedViatico.firma_jefe_hash },
                      { label: 'Revisor Administrativo', nombre: selectedViatico.firma_revisor_nombre, fecha: selectedViatico.firma_revisor_fecha, hash: selectedViatico.firma_revisor_hash },
                      { label: 'Ventanilla Tesorería (Pago)', nombre: selectedViatico.firma_tesoreria_nombre, fecha: selectedViatico.firma_tesoreria_fecha, hash: selectedViatico.firma_tesoreria_hash },
                    ].map((sig, idx) => (
                      <div key={idx} style={{ paddingBottom: 12, borderBottom: idx < 3 ? '1px solid #E2E8F0' : 'none' }}>
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
