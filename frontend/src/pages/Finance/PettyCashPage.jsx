/**
 * SIAE — Página de Administración de Fondo Fijo (Caja Chica).
 * Permite gestionar el fondo de caja chica del DEO de forma exclusiva para administradores.
 * Soporta registro de facturas por XML, gastos manuales sin factura (con posterior vinculación de XML),
 * arqueos físicos de denominaciones (sin 50c), categorías generales y configuración de saldo asignado.
 */

import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Card, Typography, Tabs, Table, Button, Form, Modal, Upload, Tag, Row, Col,
  Space, Statistic, Select, Input, InputNumber, Alert, Timeline, Tooltip,
  Divider, Progress, Badge, Popconfirm, DatePicker, message
} from 'antd';
import {
  DollarOutlined, WalletOutlined, LoadingOutlined, CheckCircleOutlined,
  UploadOutlined, PlusOutlined, DeleteOutlined, EditOutlined, EyeOutlined,
  FilePdfOutlined, FileTextOutlined, HistoryOutlined, InfoCircleOutlined,
  BankOutlined, WarningOutlined, SyncOutlined, PieChartOutlined, BarsOutlined,
  CloseCircleOutlined, FileAddOutlined, ToolOutlined, CheckOutlined,
  DownloadOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// Constantes Fiscales para mostrar como referencia en UI
const CICESE_FISCAL = {
  rfc: "CIC7309189G8",
  regimen: "603 - Personas Morales con Fines no Lucrativos",
  cp: "22860",
  total_max: 5000.00
};

export default function PettyCashPage() {
  const { user, hasPermission } = useAuth();

  // Bloqueo de acceso si no cuenta con permiso view
  if (!hasPermission('petty_cash', 'view')) {
    return <Navigate to="/" replace />;
  }

  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState({
    total_assigned: 80000.00,
    pending_reimbursement: 0.0,
    available_balance: 80000.00,
    total_reimbursed: 0.0,
    total_spent: 0.0,
    expenses_by_category: [],
    expenses_by_group: { materiales: 0.0, servicios: 0.0, otros: 0.0 },
    recent_invoices: [],
    recent_counts: [],
    invoices_pending_count: 0,
    invoices_pending_amount: 0.0
  });

  const [categories, setCategories] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [invoicesTotal, setInvoicesTotal] = useState(0);
  const [invoicesParams, setInvoicesParams] = useState({
    skip: 0,
    limit: 15,
    search: undefined,
    category_id: undefined,
    status: undefined,
    is_manual: undefined,
    start_date: undefined,
    end_date: undefined
  });
  
  const [reimbursements, setReimbursements] = useState([]);
  const [reimbursementsTotal, setReimbursementsTotal] = useState(0);
  const [reimbursementsParams, setReimbursementsParams] = useState({ skip: 0, limit: 10 });

  const [counts, setCounts] = useState([]);
  const [countsTotal, setCountsTotal] = useState(0);
  const [countsParams, setCountsParams] = useState({ skip: 0, limit: 10 });
  const [latestCount, setLatestCount] = useState(null);

  // Modales
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invoiceForm] = Form.useForm();
  const [xmlFileList, setXmlFileList] = useState([]);
  const [pdfFileList, setPdfFileList] = useState([]);
  const [isValidatingXml, setIsValidatingXml] = useState(false);
  const [xmlValidation, setXmlValidation] = useState(null);

  // Modal Gasto Manual
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualForm] = Form.useForm();

  // Modal Editar Gasto/Factura
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedInvoiceForEdit, setSelectedInvoiceForEdit] = useState(null);
  const [editForm] = Form.useForm();

  // Modal Previsualizar PDF
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState('');

  // Modal Vincular XML
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [selectedInvoiceForLink, setSelectedInvoiceForLink] = useState(null);
  const [linkXmlFileList, setLinkXmlFileList] = useState([]);
  const [linkPdfFileList, setLinkPdfFileList] = useState([]);
  const [isLinkValidating, setIsLinkValidating] = useState(false);
  const [linkValidation, setLinkValidation] = useState(null);

  // Modal Configuración de Saldo
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [newAssignedBalance, setNewAssignedBalance] = useState(80000);

  // Modal Reposición
  const [reimbModalOpen, setReimbModalOpen] = useState(false);
  const [pendingInvoices, setPendingInvoices] = useState([]);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);
  const [reimbNotes, setReimbNotes] = useState('');
  
  // Modal Escaneo Reposición
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [selectedReimbForScan, setSelectedReimbForScan] = useState(null);
  const [scanFileList, setScanFileList] = useState([]);

  // Arqueo de Caja (Estado local)
  const [arqueoForm] = Form.useForm();
  const [arqueoTotal, setArqueoTotal] = useState(0.0);
  const [arqueoDiff, setArqueoDiff] = useState(0.0);
  const [arqueoExpected, setArqueoExpected] = useState(80000.00);

  // Categorías
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryForm] = Form.useForm();
  const [editingCategory, setEditingCategory] = useState(null);

  // Cargar datos
  const fetchSummary = async () => {
    try {
      const res = await apiClient.get('/petty-cash/summary');
      setSummary(res.data);
      setArqueoExpected(res.data.available_balance);
      setArqueoDiff(arqueoTotal - res.data.available_balance);
      setNewAssignedBalance(res.data.total_assigned);
    } catch (err) {
      message.error("Error al cargar el resumen financiero del fondo.");
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await apiClient.get('/petty-cash/categories?active_only=false');
      setCategories(res.data);
    } catch (err) {
      message.error("Error al cargar categorías de gasto.");
    }
  };

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/petty-cash/invoices', { params: invoicesParams });
      setInvoices(res.data.items);
      setInvoicesTotal(res.data.total);
    } catch (err) {
      message.error("Error al cargar facturas y gastos.");
    } finally {
      setLoading(false);
    }
  };

  const fetchReimbursements = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/petty-cash/reimbursements', { params: reimbursementsParams });
      setReimbursements(res.data.items);
      setReimbursementsTotal(res.data.total);
    } catch (err) {
      message.error("Error al cargar reposiciones.");
    } finally {
      setLoading(false);
    }
  };

  const fetchCounts = async () => {
    try {
      const res = await apiClient.get('/petty-cash/cash-counts', { params: countsParams });
      setCounts(res.data.items);
      setCountsTotal(res.data.total);
      
      const latestRes = await apiClient.get('/petty-cash/cash-counts/latest').catch(() => null);
      if (latestRes) setLatestCount(latestRes.data);
    } catch (err) {
      // Ignorar errores si no hay arqueos
    }
  };

  useEffect(() => {
    fetchSummary();
    fetchCategories();
  }, []);

  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchSummary();
    } else if (activeTab === 'invoices') {
      fetchInvoices();
    } else if (activeTab === 'reimbursements') {
      fetchReimbursements();
    } else if (activeTab === 'counts') {
      fetchCounts();
    }
  }, [activeTab, invoicesParams, reimbursementsParams, countsParams]);

  // Carga de XML para validar en tiempo real
  const handleXmlUpload = async (file) => {
    setXmlFileList([file]);
    setIsValidatingXml(true);
    setXmlValidation(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiClient.post('/petty-cash/invoices/validate-xml', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setXmlValidation(res.data);
      if (res.data.is_valid) {
        message.success("XML parseado correctamente. Datos fiscales de CICESE verificados.");
        invoiceForm.setFieldsValue({
          description: `Compra amparada por factura ${res.data.folio || ''} del emisor ${res.data.emisor_nombre}`
        });
      } else {
        message.warning("La factura no cumple con todas las reglas fiscales locales.");
      }
    } catch (err) {
      const errorMsg = err.response?.data?.detail || "Error al procesar el archivo XML.";
      message.error(errorMsg);
      setXmlValidation({
        is_valid: false,
        errors: [errorMsg]
      });
    } finally {
      setIsValidatingXml(false);
    }
    return false; // Evita subida automática
  };

  // Guardar factura XML
  const handleSaveInvoice = async (values) => {
    if (!xmlFileList.length) {
      message.error("Es obligatorio cargar el archivo XML.");
      return;
    }

    const formData = new FormData();
    formData.append('xml_file', xmlFileList[0]);
    if (pdfFileList.length) {
      formData.append('pdf_file', pdfFileList[0]);
    }
    formData.append('category_id', values.category_id);
    formData.append('description', values.description || '');

    setLoading(true);
    try {
      await apiClient.post('/petty-cash/invoices', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      message.success("Factura registrada exitosamente.");
      setInvoiceModalOpen(false);
      invoiceForm.resetFields();
      setXmlFileList([]);
      setPdfFileList([]);
      setXmlValidation(null);
      fetchInvoices();
      fetchSummary();
    } catch (err) {
      message.error(err.response?.data?.detail || "Error al registrar la factura.");
    } finally {
      setLoading(false);
    }
  };

  // Registrar Gasto Manual Sin XML
  const handleSaveManualExpense = async (values) => {
    setLoading(true);
    try {
      await apiClient.post('/petty-cash/invoices/manual', {
        fecha_emision: values.fecha_emision.toISOString(),
        emisor_nombre: values.emisor_nombre,
        emisor_rfc: values.emisor_rfc,
        total: values.total,
        category_id: values.category_id,
        description: values.description
      });
      message.success("Gasto manual registrado correctamente (Sin XML).");
      setManualModalOpen(false);
      manualForm.resetFields();
      fetchInvoices();
      fetchSummary();
    } catch (err) {
      message.error(err.response?.data?.detail || "Error al registrar el gasto manual.");
    } finally {
      setLoading(false);
    }
  };

  // Abrir modal de edición con datos precargados
  const handleEditInvoiceOpen = (invoice) => {
    setSelectedInvoiceForEdit(invoice);
    editForm.setFieldsValue({
      fecha_emision: invoice.fecha_emision ? dayjs(invoice.fecha_emision) : null,
      emisor_nombre: invoice.emisor_nombre,
      emisor_rfc: invoice.emisor_rfc,
      total: invoice.total,
      category_id: invoice.category_id,
      description: invoice.description
    });
    setEditModalOpen(true);
  };

  // Guardar cambios del gasto/factura editado
  const handleUpdateInvoice = async (values) => {
    setLoading(true);
    try {
      const payload = {
        category_id: values.category_id,
        description: values.description,
      };

      if (selectedInvoiceForEdit.is_manual) {
        payload.fecha_emision = values.fecha_emision.toISOString();
        payload.emisor_nombre = values.emisor_nombre;
        payload.emisor_rfc = values.emisor_rfc;
        payload.total = values.total;
      }

      await apiClient.put(`/petty-cash/invoices/${selectedInvoiceForEdit.id}`, payload);
      message.success("Gasto/Factura actualizado correctamente.");
      setEditModalOpen(false);
      setSelectedInvoiceForEdit(null);
      editForm.resetFields();
      fetchInvoices();
      fetchSummary();
    } catch (err) {
      message.error(err.response?.data?.detail || "Error al actualizar el gasto.");
    } finally {
      setLoading(false);
    }
  };

  // Exportar el listado actual de facturas y gastos a formato CSV (Excel compatible)
  const handleExportCSV = () => {
    if (!invoices.length) {
      message.warning("No hay facturas ni gastos cargados para exportar.");
      return;
    }

    const headers = [
      "Fecha Gasto",
      "Tipo",
      "UUID / Folio Fiscal",
      "Folio",
      "Serie",
      "Proveedor (RFC)",
      "Proveedor (Nombre)",
      "Subtotal",
      "IVA",
      "Total",
      "Categoria",
      "Descripcion",
      "Estado"
    ];

    const rows = invoices.map(rec => [
      rec.fecha_emision ? dayjs(rec.fecha_emision).format('YYYY-MM-DD') : 'S/F',
      rec.is_manual ? 'Manual' : 'XML',
      rec.uuid || 'N/A',
      rec.folio || 'N/A',
      rec.serie || 'N/A',
      rec.emisor_rfc || 'N/A',
      `"${(rec.emisor_nombre || '').replace(/"/g, '""')}"`,
      rec.subtotal,
      rec.iva,
      rec.total,
      rec.category?.name || 'Sin Clasificar',
      `"${(rec.description || '').replace(/"/g, '""')}"`,
      rec.status
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `siae_reporte_cajachica_${dayjs().format('YYYYMMDD_HHmmss')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success("Reporte CSV descargado con éxito.");
  };

  // Descargar el PDF actual en previsualización
  const handleDownloadPdf = async () => {
    if (!pdfPreviewUrl) return;
    try {
      message.loading({ content: "Descargando archivo PDF...", key: "pdfDownload" });
      const response = await fetch(pdfPreviewUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filename = pdfPreviewUrl.split('/').pop() || 'factura.pdf';
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      message.success({ content: "PDF descargado con éxito.", key: "pdfDownload", duration: 2 });
    } catch (err) {
      message.error({ content: "Error al descargar el archivo PDF.", key: "pdfDownload", duration: 3 });
    }
  };

  // Descargar ZIP con todas las facturas y comprobantes del paquete de reposición
  const handleDownloadZip = async (reimbId, folio) => {
    try {
      message.loading({ content: "Generando archivo ZIP de comprobantes...", key: "zipDownload" });
      const response = await apiClient.get(`/petty-cash/reimbursements/${reimbId}/zip`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `comprobantes_reposicion_${folio || reimbId}.zip`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      message.success({ content: "ZIP descargado con éxito.", key: "zipDownload", duration: 2 });
    } catch (err) {
      message.error({ content: "Error al generar el archivo ZIP.", key: "zipDownload", duration: 3 });
    }
  };

  // Cargar XML en vinculación
  const handleLinkXmlUpload = async (file) => {
    setLinkXmlFileList([file]);
    setIsLinkValidating(true);
    setLinkValidation(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiClient.post('/petty-cash/invoices/validate-xml', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      // Validar si el monto del XML coincide relativamente con el del gasto manual
      const amountDiff = Math.abs(res.data.total - selectedInvoiceForLink.total);
      
      if (amountDiff > 5.0) {
        res.data.is_valid = false;
        res.data.errors.push(`El total de la factura XML ($${res.data.total.toFixed(2)}) no coincide con el gasto manual ($${selectedInvoiceForLink.total.toFixed(2)}). Margen de tolerancia máx: $5.00`);
      }

      setLinkValidation(res.data);
      if (res.data.is_valid) {
        message.success("XML válido y montos coinciden.");
      } else {
        message.warning("La factura XML no coincide o contiene errores fiscales.");
      }
    } catch (err) {
      const errorMsg = err.response?.data?.detail || "Error al validar el archivo XML.";
      message.error(errorMsg);
      setLinkValidation({
        is_valid: false,
        errors: [errorMsg]
      });
    } finally {
      setIsLinkValidating(false);
    }
    return false;
  };

  // Vincular XML
  const handleLinkXmlSave = async () => {
    if (!linkXmlFileList.length) {
      message.error("Debes cargar el archivo XML de la factura.");
      return;
    }

    const formData = new FormData();
    formData.append('xml_file', linkXmlFileList[0]);
    if (linkPdfFileList.length) {
      formData.append('pdf_file', linkPdfFileList[0]);
    }

    setLoading(true);
    try {
      await apiClient.post(`/petty-cash/invoices/${selectedInvoiceForLink.id}/link-xml`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      message.success("Factura XML vinculada exitosamente. Gasto regularizado.");
      setLinkModalOpen(false);
      setLinkXmlFileList([]);
      setLinkPdfFileList([]);
      setLinkValidation(null);
      setSelectedInvoiceForLink(null);
      fetchInvoices();
      fetchSummary();
    } catch (err) {
      message.error(err.response?.data?.detail || "Error al vincular XML.");
    } finally {
      setLoading(false);
    }
  };

  // Guardar configuración de Saldo Asignado
  const handleSaveSettings = async () => {
    try {
      await apiClient.put('/petty-cash/settings', { petty_cash_assigned: newAssignedBalance });
      message.success("Monto asignado del fondo actualizado correctamente.");
      setSettingsModalOpen(false);
      fetchSummary();
    } catch (err) {
      message.error(err.response?.data?.detail || "No se pudo actualizar la configuración.");
    }
  };

  // Eliminar factura
  const handleDeleteInvoice = async (id) => {
    try {
      await apiClient.delete(`/petty-cash/invoices/${id}`);
      message.success("Gasto/Factura eliminado correctamente.");
      fetchInvoices();
      fetchSummary();
    } catch (err) {
      message.error(err.response?.data?.detail || "No se pudo eliminar.");
    }
  };

  // Consultar estado en el SAT
  const handleVerifySat = async (id) => {
    setLoading(true);
    try {
      const res = await apiClient.post(`/petty-cash/invoices/${id}/verify-sat`);
      message.success(`Verificación completa. Estado en el SAT: ${res.data.sat_status}`);
      fetchInvoices();
      fetchSummary();
    } catch (err) {
      message.error(err.response?.data?.detail || "Error al conectar con el servicio de validación del SAT.");
    } finally {
      setLoading(false);
    }
  };

  // Cargar facturas pendientes para reposición
  const openNewReimbursementModal = async () => {
    try {
      const res = await apiClient.get('/petty-cash/invoices?status=pendiente&limit=100');
      setPendingInvoices(res.data.items);
      setSelectedInvoiceIds([]);
      setReimbNotes('');
      setReimbModalOpen(true);
    } catch (err) {
      message.error("Error al cargar las facturas pendientes.");
    }
  };

  // Validaciones del paquete de reposición
  const getReimbursementValidation = () => {
    if (!selectedInvoiceIds.length) return { valid: false, reason: "Selecciona al menos un gasto." };
    if (selectedInvoiceIds.length > 15) return { valid: false, reason: "No se pueden incluir más de 15 gastos por reposición." };
    
    const selectedInvoices = pendingInvoices.filter(i => selectedInvoiceIds.includes(i.id));
    const total = selectedInvoices.reduce((sum, i) => sum + i.total, 0);
    return { valid: true, total };
  };

  const handleCreateReimbursement = async () => {
    const val = getReimbursementValidation();
    if (!val.valid) {
      message.error(val.reason);
      return;
    }

    try {
      await apiClient.post('/petty-cash/reimbursements', {
        invoice_ids: selectedInvoiceIds,
        notes: reimbNotes
      });
      message.success("Solicitud de reposición creada exitosamente.");
      setReimbModalOpen(false);
      fetchReimbursements();
      fetchSummary();
    } catch (err) {
      message.error(err.response?.data?.detail || "Error al crear la reposición.");
    }
  };

  const handleUpdateReimbStatus = async (id, status) => {
    try {
      await apiClient.put(`/petty-cash/reimbursements/${id}/status`, { status });
      message.success(`Reposición marcada como '${status.replace('_', ' ')}'.`);
      fetchReimbursements();
      fetchSummary();
    } catch (err) {
      message.error(err.response?.data?.detail || "Error al cambiar el estado.");
    }
  };

  const handleDeleteReimbursement = async (id) => {
    try {
      await apiClient.delete(`/petty-cash/reimbursements/${id}`);
      message.success("Reposición cancelada y facturas liberadas.");
      fetchReimbursements();
      fetchSummary();
    } catch (err) {
      message.error("Error al cancelar la reposición.");
    }
  };

  // Subir escaneo
  const handleUploadScan = async () => {
    if (!scanFileList.length) {
      message.error("Selecciona el PDF firmado.");
      return;
    }
    const formData = new FormData();
    formData.append('file', scanFileList[0]);

    try {
      await apiClient.post(`/petty-cash/reimbursements/${selectedReimbForScan.id}/upload-scan`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      message.success("Archivo escaneado cargado correctamente.");
      setScanModalOpen(false);
      setScanFileList([]);
      fetchReimbursements();
    } catch (err) {
      message.error("Error al subir el escaneado.");
    }
  };

  // Arqueo de Caja - Cálculo en vivo sin 50 centavos
  const handleArqueoValuesChange = (_, allValues) => {
    const total = (
      (allValues.bills_1000 || 0) * 1000 +
      (allValues.bills_500 || 0) * 500 +
      (allValues.bills_200 || 0) * 200 +
      (allValues.bills_100 || 0) * 100 +
      (allValues.bills_50 || 0) * 50 +
      (allValues.bills_20 || 0) * 20 +
      (allValues.coins_10 || 0) * 10 +
      (allValues.coins_5 || 0) * 5 +
      (allValues.coins_2 || 0) * 2 +
      (allValues.coins_1 || 0) * 1
    );
    setArqueoTotal(total);
    setArqueoDiff(total - arqueoExpected);
  };

  const handleSaveArqueo = async (values) => {
    try {
      await apiClient.post('/petty-cash/cash-counts', values);
      message.success("Arqueo de caja chica guardado con éxito.");
      arqueoForm.resetFields();
      setArqueoTotal(0.0);
      setArqueoDiff(-arqueoExpected);
      fetchCounts();
    } catch (err) {
      message.error("Error al guardar el arqueo.");
    }
  };

  // CRUD Categorías
  const handleSaveCategory = async (values) => {
    try {
      if (editingCategory) {
        await apiClient.put(`/petty-cash/categories/${editingCategory.id}`, values);
        message.success("Categoría actualizada correctamente.");
      } else {
        await apiClient.post('/petty-cash/categories', values);
        message.success("Categoría creada con éxito.");
      }
      setCategoryModalOpen(false);
      categoryForm.resetFields();
      setEditingCategory(null);
      fetchCategories();
    } catch (err) {
      message.error(err.response?.data?.detail || "Error al guardar la categoría.");
    }
  };

  const handleDeleteCategory = async (id) => {
    try {
      await apiClient.delete(`/petty-cash/categories/${id}`);
      message.success("Categoría desactivada.");
      fetchCategories();
    } catch (err) {
      message.error("Error al desactivar la categoría.");
    }
  };

  const statusColors = {
    pendiente: 'red',
    en_reposicion: 'orange',
    repuesta: 'green',
    en_proceso: 'blue',
    aprobado: 'warning',
    pagado: 'success'
  };

  const groupColors = {
    materiales: 'blue',
    servicios: 'purple',
    otros: 'cyan'
  };

  return (
    <div style={{ padding: '24px', minHeight: 'calc(100vh - 64px)', background: '#f5f7fa' }}>
      
      {/* HEADER DE FINANZAS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={2} style={{ margin: 0, fontWeight: 700, color: '#001529' }}>
            <BankOutlined style={{ marginRight: 12, color: '#1890ff' }} />
            Finanzas — Fondo Fijo
          </Title>
          <Text type="secondary">Módulo de Caja Chica. Acceso exclusivo para la Administración del DEO.</Text>
        </div>
        
        <Space>
          {activeTab === 'invoices' && (
            <Space>
              <Button 
                type="primary" 
                icon={<FileAddOutlined />} 
                onClick={() => setInvoiceModalOpen(true)}
                style={{ borderRadius: 6, fontWeight: 600, height: 40 }}
              >
                Cargar XML
              </Button>
              <Button 
                icon={<PlusOutlined />} 
                onClick={() => setManualModalOpen(true)}
                style={{ borderRadius: 6, fontWeight: 600, height: 40 }}
              >
                Registrar Gasto Sin Factura
              </Button>
              <Button 
                icon={<UploadOutlined style={{ transform: 'rotate(180deg)' }} />} 
                onClick={handleExportCSV}
                style={{ borderRadius: 6, fontWeight: 600, height: 40 }}
              >
                Exportar CSV
              </Button>
            </Space>
          )}
          {activeTab === 'reimbursements' && (
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={openNewReimbursementModal}
              style={{ borderRadius: 6, fontWeight: 600, height: 40 }}
            >
              Nueva Reposición
            </Button>
          )}
          <Button 
            icon={<SyncOutlined spin={loading} />} 
            onClick={() => {
              fetchSummary();
              if (activeTab === 'invoices') fetchInvoices();
              if (activeTab === 'reimbursements') fetchReimbursements();
              if (activeTab === 'counts') fetchCounts();
              message.success("Datos sincronizados.");
            }}
            style={{ borderRadius: 6, height: 40 }}
          />
        </Space>
      </div>

      {/* TABS CENTRALES */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        type="line"
        size="large"
        style={{ marginBottom: 24 }}
        items={[
          
          // ── TAB 1: DASHBOARD ──
          {
            key: 'dashboard',
            label: <span><WalletOutlined /> Dashboard General</span>,
            children: (
              <div>
                {summary.available_balance < (summary.total_assigned * 0.15) && (
                  <Alert
                    message="Advertencia de Saldo Bajo en Caja Chica"
                    description={`El saldo disponible actual ($${summary.available_balance.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN) es menor al 15% del monto total asignado ($${summary.total_assigned.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN). Te sugerimos generar una nueva solicitud de reposición.`}
                    type="warning"
                    showIcon
                    closable
                    style={{ marginBottom: 20, borderRadius: 8 }}
                  />
                )}
                {/* TARJETAS DE KPIS */}
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                  <Col xs={24} sm={12} md={6}>
                    <Card 
                      bordered={false} 
                      style={{ borderLeft: '4px solid #1890ff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
                      extra={
                        <Tooltip title="Configurar monto del fondo">
                          <Button 
                            type="text" 
                            size="small" 
                            icon={<EditOutlined style={{ color: '#1890ff' }} />}
                            onClick={() => setSettingsModalOpen(true)}
                          />
                        </Tooltip>
                      }
                    >
                      <Statistic
                        title={<span style={{ fontWeight: 600, color: '#888' }}>Fondo Asignado</span>}
                        value={summary.total_assigned}
                        precision={2}
                        prefix={<WalletOutlined style={{ color: '#1890ff' }} />}
                        suffix="MXN"
                        valueStyle={{ color: '#001529', fontWeight: 700 }}
                      />
                      <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>Monto editable institucional</div>
                    </Card>
                  </Col>
                  <Col xs={24} sm={12} md={6}>
                    <Card bordered={false} style={{ borderLeft: '4px solid #52c41a', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                      <Statistic
                        title={<span style={{ fontWeight: 600, color: '#888' }}>Disponible en Caja</span>}
                        value={summary.available_balance}
                        precision={2}
                        prefix={<DollarOutlined style={{ color: '#52c41a' }} />}
                        suffix="MXN"
                        valueStyle={{ color: '#389e0d', fontWeight: 700 }}
                      />
                      <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>Dinero físico esperado en caja</div>
                    </Card>
                  </Col>
                  <Col xs={24} sm={12} md={6}>
                    <Card bordered={false} style={{ borderLeft: '4px solid #fa8c16', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                      <Statistic
                        title={<span style={{ fontWeight: 600, color: '#888' }}>Gastos en Tránsito</span>}
                        value={summary.pending_reimbursement}
                        precision={2}
                        prefix={<LoadingOutlined style={{ color: '#fa8c16' }} />}
                        suffix="MXN"
                        valueStyle={{ color: '#d46b08', fontWeight: 700 }}
                      />
                      <div style={{ marginTop: 8, fontSize: 12, color: '#fa8c16' }}>
                        {summary.invoices_pending_count} gastos sin reponer
                      </div>
                    </Card>
                  </Col>
                  <Col xs={24} sm={12} md={6}>
                    <Card bordered={false} style={{ borderLeft: '4px solid #722ed1', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                      <Statistic
                        title={<span style={{ fontWeight: 600, color: '#888' }}>Total Repuesto</span>}
                        value={summary.total_reimbursed}
                        precision={2}
                        prefix={<CheckCircleOutlined style={{ color: '#722ed1' }} />}
                        suffix="MXN"
                        valueStyle={{ color: '#531dab', fontWeight: 700 }}
                      />
                      <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>Histórico consolidado devuelto</div>
                    </Card>
                  </Col>
                </Row>

                {/* GRÁFICOS PERSONALIZADOS Y ACTIVIDAD RECIENTE */}
                <Row gutter={[24, 24]}>
                  {/* GRÁFICO SVG INTEGRADO */}
                  <Col xs={24} lg={14}>
                    <Card title={<span style={{ fontWeight: 700 }}><PieChartOutlined /> Distribución de Gastos por Categoría</span>} bordered={false} style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', height: '100%' }}>
                      {summary.expenses_by_category.length === 0 ? (
                        <div style={{ padding: '60px 0', textAlign: 'center', color: '#888' }}>
                          <InfoCircleOutlined style={{ fontSize: 24, marginBottom: 12 }} />
                          <p>No se han registrado gastos ni facturas en el sistema aún.</p>
                        </div>
                      ) : (
                        <div>
                          {/* GRÁFICO DE BARRAS SVG DIBUJADO A MANO */}
                          <div style={{ margin: '12px 0 24px 0', overflowX: 'auto' }}>
                            <svg width="100%" height="220" style={{ minWidth: '400px' }}>
                              <defs>
                                <linearGradient id="barGrad" x1="0" y1="1" x2="0" y2="0">
                                  <stop offset="0%" stopColor="#1890ff" stopOpacity="0.4" />
                                  <stop offset="100%" stopColor="#1890ff" stopOpacity="0.9" />
                                </linearGradient>
                              </defs>
                              
                              <line x1="40" y1="180" x2="95%" y2="180" stroke="#ddd" strokeWidth="1" />
                              <line x1="40" y1="130" x2="95%" y2="130" stroke="#eee" strokeWidth="1" strokeDasharray="4 4" />
                              <line x1="40" y1="80" x2="95%" y2="80" stroke="#eee" strokeWidth="1" strokeDasharray="4 4" />
                              <line x1="40" y1="30" x2="95%" y2="30" stroke="#eee" strokeWidth="1" strokeDasharray="4 4" />
                              
                              {(() => {
                                const maxAmount = Math.max(...summary.expenses_by_category.map(c => c.amount), 1);
                                const barWidth = 35;
                                const spacing = 35;
                                
                                return summary.expenses_by_category.map((cat, idx) => {
                                  const barHeight = (cat.amount / maxAmount) * 140;
                                  const x = 60 + idx * (barWidth + spacing);
                                  const y = 180 - barHeight;
                                  
                                  return (
                                    <g key={cat.name}>
                                      <Tooltip title={`${cat.name}: $${cat.amount.toFixed(2)} MXN`}>
                                        <rect
                                          x={x}
                                          y={y}
                                          width={barWidth}
                                          height={barHeight}
                                          fill={cat.color || "url(#barGrad)"}
                                          rx="4"
                                          style={{ cursor: 'pointer', transition: 'all 0.3s' }}
                                        />
                                      </Tooltip>
                                      <text
                                        x={x + barWidth/2}
                                        y="195"
                                        textAnchor="middle"
                                        fontSize="9"
                                        fill="#555"
                                        fontWeight="500"
                                      >
                                        {cat.name.length > 8 ? `${cat.name.substring(0, 7)}.` : cat.name}
                                      </text>
                                      <text
                                        x={x + barWidth/2}
                                        y={y - 5}
                                        textAnchor="middle"
                                        fontSize="9"
                                        fill="#333"
                                        fontWeight="600"
                                      >
                                        {`$${Math.round(cat.amount)}`}
                                      </text>
                                    </g>
                                  );
                                });
                              })()}
                            </svg>
                          </div>
                          
                          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                            {summary.expenses_by_category.map(cat => (
                              <div key={cat.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <Space>
                                  <Badge color={cat.color} />
                                  <Text style={{ fontSize: 13, fontWeight: 500 }}>{cat.name}</Text>
                                  <Tag color={groupColors[cat.group] || 'default'} size="small">{cat.group}</Tag>
                                </Space>
                                <Text style={{ fontWeight: 600 }}>${cat.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</Text>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </Card>
                  </Col>
                  
                  {/* HISTORIAL Y ARQUEOS */}
                  <Col xs={24} lg={10}>
                    <Card title={<span style={{ fontWeight: 700 }}><HistoryOutlined /> Actividad y Estado de Caja Chica</span>} bordered={false} style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', height: '100%' }}>
                      <Title level={5} style={{ margin: '0 0 16px 0', fontWeight: 600 }}>Últimos Gastos Registrados</Title>
                      
                      {summary.recent_invoices.length === 0 ? (
                        <div style={{ padding: '20px 0', textAlign: 'center', color: '#999' }}>
                          Sin gastos registrados
                        </div>
                      ) : (
                        <Timeline
                          mode="left"
                          items={summary.recent_invoices.map(inv => ({
                            color: statusColors[inv.status],
                            children: (
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <Text strong style={{ fontSize: 13 }}>
                                    {inv.emisor_nombre}
                                    {inv.is_manual && <Tag color="warning" style={{ fontSize: 9, marginLeft: 6 }}>Sin XML</Tag>}
                                  </Text>
                                  <Text strong style={{ color: '#d46b08' }}>${inv.total.toFixed(2)}</Text>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888', marginTop: 2 }}>
                                  <span>{inv.category_name}</span>
                                  <span>{dayjs(inv.created_at).format('DD/MM/YYYY HH:mm')}</span>
                                </div>
                              </div>
                            )
                          }))}
                        />
                      )}
                      
                      <Divider style={{ margin: '16px 0' }} />
                      <Title level={5} style={{ margin: '0 0 16px 0', fontWeight: 600 }}>Últimos Arqueos de Caja</Title>
                      
                      {summary.recent_counts.length === 0 ? (
                        <Alert 
                          message="Sin arqueos guardados" 
                          description="Se recomienda realizar arqueos periódicamente para asegurar que el dinero en físico coincida con el cálculo del sistema." 
                          type="warning" 
                          showIcon 
                        />
                      ) : (
                        <div>
                          {summary.recent_counts.map(cnt => (
                            <Card key={cnt.id} size="small" style={{ marginBottom: 8, background: '#fafafa', border: '1px solid #eee' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                  <Text strong style={{ fontSize: 12 }}>{dayjs(cnt.count_date).format('DD/MM/YYYY HH:mm')}</Text>
                                  <div style={{ fontSize: 11, color: '#888' }}>Por: {cnt.counted_by}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <Text strong style={{ fontSize: 13 }}>${cnt.total_counted.toFixed(2)}</Text>
                                  <div>
                                    <Tag color={cnt.difference === 0 ? 'green' : 'red'} style={{ margin: 0, fontSize: 10 }}>
                                      {cnt.difference === 0 ? 'Sin diferencia' : `Dif: $${cnt.difference.toFixed(2)}`}
                                    </Tag>
                                  </div>
                                </div>
                              </div>
                            </Card>
                          ))}
                        </div>
                      )}
                    </Card>
                  </Col>
                </Row>
              </div>
            )
          },

          // ── TAB 2: FACTURAS ──
          {
            key: 'invoices',
            label: <span><FileTextOutlined /> Facturas y Gastos</span>,
            children: (
              <Card bordered={false} style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                {/* PANEL DE FILTROS */}
                <div style={{ marginBottom: 20, padding: '16px', background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0' }}>
                  <Row gutter={[16, 16]} align="middle">
                    <Col xs={24} sm={12} md={6} lg={5}>
                      <div style={{ fontWeight: 600, fontSize: 12, color: '#555', marginBottom: 6 }}>Buscar Gasto / Proveedor</div>
                      <Input
                        placeholder="Folio, UUID, Proveedor o Desc."
                        value={invoicesParams.search}
                        onChange={(e) => {
                          const val = e.target.value;
                          setInvoicesParams(prev => ({ ...prev, search: val || undefined, skip: 0 }));
                        }}
                        allowClear
                        style={{ width: '100%' }}
                      />
                    </Col>
                    <Col xs={24} sm={12} md={6} lg={4}>
                      <div style={{ fontWeight: 600, fontSize: 12, color: '#555', marginBottom: 6 }}>Categoría</div>
                      <Select
                        placeholder="Todas"
                        value={invoicesParams.category_id}
                        onChange={(val) => setInvoicesParams(prev => ({ ...prev, category_id: val, skip: 0 }))}
                        allowClear
                        style={{ width: '100%' }}
                      >
                        {categories.map(cat => (
                          <Select.Option key={cat.id} value={cat.id}>
                            {cat.icon} {cat.name}
                          </Select.Option>
                        ))}
                      </Select>
                    </Col>
                    <Col xs={24} sm={12} md={6} lg={4}>
                      <div style={{ fontWeight: 600, fontSize: 12, color: '#555', marginBottom: 6 }}>Estado</div>
                      <Select
                        placeholder="Todos"
                        value={invoicesParams.status}
                        onChange={(val) => setInvoicesParams(prev => ({ ...prev, status: val, skip: 0 }))}
                        allowClear
                        style={{ width: '100%' }}
                      >
                        <Select.Option value="pendiente">Pendiente</Select.Option>
                        <Select.Option value="en_reposicion">En Reposición</Select.Option>
                        <Select.Option value="repuesta">Repuesta</Select.Option>
                      </Select>
                    </Col>
                    <Col xs={24} sm={12} md={6} lg={4}>
                      <div style={{ fontWeight: 600, fontSize: 12, color: '#555', marginBottom: 6 }}>Comprobante</div>
                      <Select
                        placeholder="Todos"
                        value={invoicesParams.is_manual}
                        onChange={(val) => setInvoicesParams(prev => ({ ...prev, is_manual: val, skip: 0 }))}
                        allowClear
                        style={{ width: '100%' }}
                      >
                        <Select.Option value={false}>Factura XML</Select.Option>
                        <Select.Option value={true}>Manual (Sin XML)</Select.Option>
                      </Select>
                    </Col>
                    <Col xs={24} sm={24} md={12} lg={5}>
                      <div style={{ fontWeight: 600, fontSize: 12, color: '#555', marginBottom: 6 }}>Rango de Fechas</div>
                      <DatePicker.RangePicker
                        value={invoicesParams.start_date ? [dayjs(invoicesParams.start_date), dayjs(invoicesParams.end_date)] : null}
                        onChange={(dates) => {
                          setInvoicesParams(prev => ({
                            ...prev,
                            start_date: dates ? dates[0].format('YYYY-MM-DD') : undefined,
                            end_date: dates ? dates[1].format('YYYY-MM-DD') : undefined,
                            skip: 0
                          }));
                        }}
                        style={{ width: '100%' }}
                      />
                    </Col>
                    <Col xs={24} sm={24} md={12} lg={2} style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600, fontSize: 12, color: '#555', marginBottom: 6 }}>&nbsp;</div>
                      <Button
                        onClick={() => {
                          setInvoicesParams({
                            skip: 0,
                            limit: 15,
                            search: undefined,
                            category_id: undefined,
                            status: undefined,
                            is_manual: undefined,
                            start_date: undefined,
                            end_date: undefined
                          });
                        }}
                        style={{ width: '100%' }}
                      >
                        Limpiar
                      </Button>
                    </Col>
                  </Row>
                </div>

                <Table
                  dataSource={invoices}
                  rowKey="id"
                  loading={loading}
                  pagination={{
                    total: invoicesTotal,
                    current: Math.floor(invoicesParams.skip / invoicesParams.limit) + 1,
                    pageSize: invoicesParams.limit,
                    onChange: (page, pageSize) => {
                      setInvoicesParams({
                        ...invoicesParams,
                        skip: (page - 1) * pageSize,
                        limit: pageSize
                      });
                    }
                  }}
                  columns={[
                    {
                      title: 'Fecha Gasto',
                      dataIndex: 'fecha_emision',
                      key: 'fecha_emision',
                      render: (val) => val ? dayjs(val).format('DD/MM/YYYY') : 'S/F',
                      width: 120
                    },
                    {
                      title: 'Folio / Serie',
                      key: 'folio_serie',
                      render: (_, rec) => (
                        <div>
                          <Text strong>{rec.folio || 'S/F'}</Text>
                          {rec.serie && <div style={{ fontSize: 11, color: '#888' }}>Serie: {rec.serie}</div>}
                          {rec.is_manual && (() => {
                            const daysOld = dayjs().diff(dayjs(rec.created_at), 'day');
                            if (daysOld >= 7 && rec.status === 'pendiente') {
                              return (
                                <Tooltip title={`Gasto manual registrado hace ${daysOld} días sin vincular factura XML.`}>
                                  <Tag color="red" style={{ fontSize: 10, marginTop: 4, fontWeight: 600 }}>
                                    <WarningOutlined /> ¡Pendiente {daysOld}d!
                                  </Tag>
                                </Tooltip>
                              );
                            }
                            return <Tag color="warning" style={{ fontSize: 10, marginTop: 4 }}>Sin XML</Tag>;
                          })()}
                        </div>
                      ),
                      width: 120
                    },
                    {
                      title: 'Proveedor (Emisor)',
                      key: 'emisor',
                      render: (_, rec) => (
                        <div>
                          <div style={{ fontWeight: 600 }}>{rec.emisor_nombre}</div>
                          <div style={{ fontSize: 11, color: '#888' }}>{rec.emisor_rfc}</div>
                        </div>
                      )
                    },
                    {
                      title: 'Categoría',
                      dataIndex: 'category',
                      key: 'category',
                      render: (cat) => cat ? (
                        <Tag color={cat.color} style={{ fontWeight: 500 }}>
                          {cat.icon} {cat.name}
                        </Tag>
                      ) : 'Sin clasificar'
                    },
                    {
                      title: 'Total',
                      dataIndex: 'total',
                      key: 'total',
                      render: (total) => <span style={{ fontWeight: 700, color: '#000' }}>${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>,
                      align: 'right',
                      width: 120
                    },
                    {
                      title: 'Estado',
                      dataIndex: 'status',
                      key: 'status',
                      render: (status) => (
                        <Tag color={statusColors[status]} style={{ textTransform: 'capitalize', fontWeight: 600 }}>
                          {status.replace('_', ' ')}
                        </Tag>
                      ),
                      width: 120
                    },
                    {
                      title: 'Estado SAT',
                      key: 'sat_status',
                      render: (_, rec) => {
                        if (rec.is_manual || !rec.uuid) {
                          return <span style={{ color: '#aaa', fontSize: 11 }}>N/A (Manual)</span>;
                        }
                        
                        const status = rec.sat_status || 'Sin Verificar';
                        
                        let color = 'default';
                        if (status === 'Vigente') color = 'success';
                        else if (status === 'Cancelado') color = 'error';
                        else if (status === 'No Encontrado') color = 'warning';
                        else if (status === 'Error de Conexión') color = 'orange';
                        else if (status === 'Expresión no válida') color = 'orange';
                        
                        const dateText = rec.sat_verified_at 
                          ? `Verificado: ${dayjs(rec.sat_verified_at).format('DD/MM/YYYY HH:mm')}`
                          : 'No verificado recientemente';
                          
                        return (
                          <Tooltip title={dateText}>
                            <Tag color={color} style={{ fontWeight: 600 }}>
                              {status}
                            </Tag>
                          </Tooltip>
                        );
                      },
                      width: 130
                    },
                    {
                      title: 'Archivos',
                      key: 'files',
                      render: (_, rec) => (
                        <Space>
                          {rec.xml_filename ? (
                            <Tooltip title="Descargar XML">
                              <Button 
                                type="text" 
                                icon={<FileTextOutlined style={{ color: '#1890ff' }} />} 
                                href={rec.xml_filename}
                                target="_blank"
                              />
                            </Tooltip>
                          ) : (
                            rec.is_manual && (
                              <Tooltip title="Vincular factura XML">
                                <Button 
                                  type="primary" 
                                  size="small"
                                  ghost
                                  icon={<FileAddOutlined />} 
                                  onClick={() => {
                                    setSelectedInvoiceForLink(rec);
                                    setLinkModalOpen(true);
                                  }}
                                >
                                  XML
                                </Button>
                              </Tooltip>
                            )
                          )}
                          {rec.pdf_filename ? (
                            <Tooltip title="Previsualizar PDF">
                              <Button 
                                type="text" 
                                icon={<FilePdfOutlined style={{ color: '#ff4d4f' }} />} 
                                onClick={() => {
                                  const base = apiClient.defaults.baseURL || '';
                                  const host = base.replace(/\/api\/v1\/?$/, '');
                                  const url = rec.pdf_filename.startsWith('http') 
                                    ? rec.pdf_filename 
                                    : `${host}${rec.pdf_filename}`;
                                  setPdfPreviewUrl(url);
                                  setPdfPreviewOpen(true);
                                }}
                              />
                            </Tooltip>
                          ) : (
                            !rec.xml_filename && <span style={{ fontSize: 11, color: '#bbb' }}>S/D</span>
                          )}
                        </Space>
                      ),
                      width: 130
                    },
                    {
                      title: 'Acciones',
                      key: 'actions',
                      render: (_, rec) => (
                        <Space>
                          {rec.status === 'pendiente' ? (
                            <>
                              <Tooltip title="Editar gasto/factura">
                                <Button 
                                  type="text" 
                                  icon={<EditOutlined style={{ color: '#1890ff' }} />} 
                                  onClick={() => handleEditInvoiceOpen(rec)} 
                                />
                              </Tooltip>
                              <Popconfirm
                                title="¿Eliminar este gasto?"
                                description="Esta acción eliminará el gasto del registro."
                                onConfirm={() => handleDeleteInvoice(rec.id)}
                                okText="Sí, eliminar"
                                cancelText="No"
                              >
                                <Button type="text" danger icon={<DeleteOutlined />} />
                              </Popconfirm>
                            </>
                          ) : (
                            <Tooltip title="Gasto asociado a una reposición activa (no modificable/eliminable)">
                              <Button type="text" disabled icon={<EditOutlined />} />
                            </Tooltip>
                          )}
                          {rec.uuid && (
                            <Tooltip title="Re-verificar Estado SAT">
                              <Button
                                type="text"
                                icon={<SyncOutlined />}
                                onClick={() => handleVerifySat(rec.id)}
                              />
                            </Tooltip>
                          )}
                        </Space>
                      ),
                      width: 130
                    }
                  ]}
                />
              </Card>
            )
          },

          // ── TAB 3: REPOSICIONES ──
          {
            key: 'reimbursements',
            label: <span><PlusOutlined /> Reposiciones</span>,
            children: (
              <Card bordered={false} style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <Table
                  dataSource={reimbursements}
                  rowKey="id"
                  loading={loading}
                  expandable={{
                    expandedRowRender: (record) => (
                      <div style={{ padding: '8px 16px', background: '#fafafa', borderRadius: 8 }}>
                        <Title level={5} style={{ margin: '0 0 12px 0', fontSize: 13, color: '#555' }}>Facturas y Gastos en el paquete:</Title>
                        <Table
                          dataSource={record.invoices}
                          rowKey="id"
                          pagination={false}
                          size="small"
                          columns={[
                            { title: 'Fecha Gasto', dataIndex: 'fecha_emision', render: (d) => dayjs(d).format('DD/MM/YYYY') },
                            { title: 'Folio', dataIndex: 'folio', render: (f, rec) => f || (rec.is_manual ? 'Gasto Manual' : 'S/F') },
                            { title: 'Proveedor', dataIndex: 'emisor_nombre' },
                            { title: 'RFC', dataIndex: 'emisor_rfc' },
                            { title: 'Categoría', dataIndex: 'category', render: (c) => c ? `${c.icon} ${c.name}` : '' },
                            { title: 'Total', dataIndex: 'total', align: 'right', render: (t) => <strong>${t.toFixed(2)}</strong> }
                          ]}
                        />
                      </div>
                    )
                  }}
                  columns={[
                    {
                      title: 'Folio',
                      dataIndex: 'folio',
                      key: 'folio',
                      render: (val) => <Text strong style={{ color: '#1890ff' }}>{val}</Text>,
                      width: 140
                    },
                    {
                      title: 'Creación',
                      dataIndex: 'created_at',
                      key: 'created_at',
                      render: (val) => dayjs(val).format('DD/MM/YYYY HH:mm'),
                      width: 160
                    },
                    {
                      title: 'Monto Total',
                      dataIndex: 'total_amount',
                      key: 'total_amount',
                      render: (val) => <span style={{ fontWeight: 700 }}>${val.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>,
                      align: 'right',
                      width: 130
                    },
                    {
                      title: 'Gastos',
                      dataIndex: 'invoice_count',
                      key: 'invoice_count',
                      align: 'center',
                      width: 100
                    },
                    {
                      title: 'Estado',
                      dataIndex: 'status',
                      key: 'status',
                      render: (status) => (
                        <Tag color={statusColors[status]} style={{ textTransform: 'capitalize', fontWeight: 600 }}>
                          {status.replace('_', ' ')}
                        </Tag>
                      ),
                      width: 120
                    },
                    {
                      title: 'Firma de Recibido',
                      key: 'scan',
                      render: (_, rec) => rec.scan_filename ? (
                        <Button 
                          type="primary" 
                          size="small" 
                          ghost 
                          icon={<FilePdfOutlined />}
                          href={rec.scan_filename}
                          target="_blank"
                        >
                          Ver PDF
                        </Button>
                      ) : (
                        <Button 
                          size="small" 
                          icon={<UploadOutlined />} 
                          onClick={() => {
                            setSelectedReimbForScan(rec);
                            setScanModalOpen(true);
                          }}
                        >
                          Subir PDF
                        </Button>
                      ),
                      width: 150
                    },
                    {
                      title: 'Cambio de Estado',
                      key: 'actions',
                      render: (_, rec) => (
                        <Space>
                          <Tooltip title="Descargar paquete de comprobantes (ZIP)">
                            <Button 
                              type="text" 
                              icon={<InboxOutlined style={{ color: '#722ed1' }} />} 
                              onClick={() => handleDownloadZip(rec.id, rec.folio)} 
                            />
                          </Tooltip>
                          {rec.status === 'en_proceso' && (
                            <Button 
                              type="primary" 
                              size="small" 
                              onClick={() => handleUpdateReimbStatus(rec.id, 'approved')}
                            >
                              Aprobar
                            </Button>
                          )}
                          {rec.status === 'aprobado' && (
                            <Popconfirm
                              title="¿Confirmar reposición física de efectivo?"
                              description="Esta acción repondrá el efectivo en la caja chica física de CICESE."
                              onConfirm={() => handleUpdateReimbStatus(rec.id, 'pagado')}
                            >
                              <Button type="primary" size="small" style={{ background: '#52c41a', borderColor: '#52c41a', color: '#fff' }}>
                                Confirmar Pago
                              </Button>
                            </Popconfirm>
                          )}
                          {rec.status !== 'pagado' ? (
                            <Popconfirm
                              title="¿Cancelar solicitud de reposición?"
                              description="Las facturas se liberarán y volverán a estar pendientes de cobro."
                              onConfirm={() => handleDeleteReimbursement(rec.id)}
                            >
                              <Button type="text" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          ) : (
                            <span style={{ fontSize: 11, color: '#888' }}>Reposición pagada</span>
                          )}
                        </Space>
                      )
                    }
                  ]}
                />
              </Card>
            )
          },

          // ── TAB 4: ARQUEO DE CAJA (SIN 50 CENTAVOS) ──
          {
            key: 'counts',
            label: <span><HistoryOutlined /> Arqueo de Caja</span>,
            children: (
              <Row gutter={[24, 24]}>
                {/* Formulario de Conteo */}
                <Col xs={24} lg={11}>
                  <Card title={<span style={{ fontWeight: 700 }}><DollarOutlined /> Auditoría Física de Billetes y Monedas</span>} bordered={false} style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    <Form
                      form={arqueoForm}
                      layout="horizontal"
                      labelCol={{ span: 8 }}
                      wrapperCol={{ span: 16 }}
                      onValuesChange={handleArqueoValuesChange}
                      onFinish={handleSaveArqueo}
                    >
                      <Divider orientation="left" style={{ margin: '0 0 16px 0' }}>Billetes</Divider>
                      <Form.Item label="$1,000" name="bills_1000" initialValue={0}>
                        <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item label="$500" name="bills_500" initialValue={0}>
                        <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item label="$200" name="bills_200" initialValue={0}>
                        <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item label="$100" name="bills_100" initialValue={0}>
                        <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item label="$50" name="bills_50" initialValue={0}>
                        <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item label="$20" name="bills_20" initialValue={0}>
                        <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                      </Form.Item>

                      <Divider orientation="left" style={{ margin: '16px 0' }}>Monedas</Divider>
                      <Form.Item label="$10" name="coins_10" initialValue={0}>
                        <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item label="$5" name="coins_5" initialValue={0}>
                        <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item label="$2" name="coins_2" initialValue={0}>
                        <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item label="$1" name="coins_1" initialValue={0}>
                        <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                      </Form.Item>

                      <Form.Item label="Notas" name="notes">
                        <TextArea rows={2} placeholder="Justificación o aclaraciones en caso de diferencias..." />
                      </Form.Item>

                      <Card style={{ background: '#fafafa', marginBottom: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text>Total Contado Físico:</Text>
                          <Text strong>${arqueoTotal.toFixed(2)} MXN</Text>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text>Saldo Esperado (Sistema):</Text>
                          <Text strong>${arqueoExpected.toFixed(2)} MXN</Text>
                        </div>
                        <Divider style={{ margin: '8px 0' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Text strong>Diferencia:</Text>
                          <Text 
                            strong 
                            style={{ color: arqueoDiff === 0 ? '#52c41a' : arqueoDiff > 0 ? '#1890ff' : '#f5222d' }}
                          >
                            {arqueoDiff === 0 ? 'Sin diferencia ($0.00)' : `${arqueoDiff > 0 ? '+' : ''}$${arqueoDiff.toFixed(2)} MXN`}
                          </Text>
                        </div>
                      </Card>

                      <Form.Item wrapperCol={{ offset: 8, span: 16 }} style={{ margin: 0 }}>
                        <Button 
                          type="primary" 
                          htmlType="submit" 
                          icon={<CheckCircleOutlined />} 
                          disabled={arqueoTotal === 0}
                          style={{ borderRadius: 6, fontWeight: 600, width: '100%', height: 40 }}
                        >
                          Guardar Arqueo de Caja
                        </Button>
                      </Form.Item>
                    </Form>
                  </Card>
                </Col>

                {/* Historial de Arqueos */}
                <Col xs={24} lg={13}>
                  <Card title={<span style={{ fontWeight: 700 }}><HistoryOutlined /> Historial de Arqueos</span>} bordered={false} style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    <Table
                      dataSource={counts}
                      rowKey="id"
                      size="small"
                      columns={[
                        {
                          title: 'Fecha',
                          dataIndex: 'count_date',
                          render: (val) => dayjs(val).format('DD/MM/YYYY HH:mm'),
                          width: 140
                        },
                        {
                          title: 'Contado',
                          dataIndex: 'total_counted',
                          render: (v) => <strong>${v.toFixed(2)}</strong>,
                          align: 'right'
                        },
                        {
                          title: 'Esperado',
                          dataIndex: 'expected_balance',
                          render: (v) => `$${v.toFixed(2)}`,
                          align: 'right'
                        },
                        {
                          title: 'Diferencia',
                          dataIndex: 'difference',
                          align: 'right',
                          render: (diff) => (
                            <Tag color={diff === 0 ? 'green' : 'red'}>
                              {diff === 0 ? '$0.00' : `${diff > 0 ? '+' : ''}$${diff.toFixed(2)}`}
                            </Tag>
                          )
                        },
                        {
                          title: 'Notas',
                          dataIndex: 'notes',
                          ellipsis: true
                        },
                        {
                          title: 'Auditador',
                          dataIndex: 'counted_by',
                          render: (u) => u ? u.full_name : 'Sistema'
                        }
                      ]}
                    />
                  </Card>
                </Col>
              </Row>
            )
          },

          // ── TAB 5: CATEGORÍAS DE GASTO ──
          {
            key: 'categories',
            label: <span><BarsOutlined /> Categorías</span>,
            children: (
              <Card 
                title={<span style={{ fontWeight: 700 }}>Catálogo de Categorías Generales (Finanzas)</span>} 
                bordered={false} 
                style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
                extra={
                  <Button 
                    type="primary" 
                    icon={<PlusOutlined />} 
                    onClick={() => {
                      setEditingCategory(null);
                      categoryForm.resetFields();
                      setCategoryModalOpen(true);
                    }}
                    style={{ borderRadius: 6 }}
                  >
                    Nueva Categoría
                  </Button>
                }
              >
                <Table
                  dataSource={categories}
                  rowKey="id"
                  pagination={false}
                  columns={[
                    {
                      title: 'Ícono',
                      dataIndex: 'icon',
                      key: 'icon',
                      render: (icon) => <span style={{ fontSize: 18 }}>{icon}</span>,
                      width: 80,
                      align: 'center'
                    },
                    {
                      title: 'Nombre de Categoría',
                      dataIndex: 'name',
                      key: 'name',
                      render: (name, rec) => <span style={{ fontWeight: 600, color: rec.color || '#333' }}>{name}</span>
                    },
                    {
                      title: 'Grupo',
                      dataIndex: 'group',
                      key: 'group',
                      render: (group) => (
                        <Tag color={groupColors[group] || 'default'} style={{ textAnchor: 'middle', textTransform: 'capitalize' }}>
                          {group}
                        </Tag>
                      )
                    },
                    {
                      title: 'Estado',
                      dataIndex: 'is_active',
                      key: 'is_active',
                      render: (active) => active ? <Tag color="green">Activa</Tag> : <Tag color="red">Inactiva</Tag>,
                      width: 100
                    },
                    {
                      title: 'Acciones',
                      key: 'actions',
                      render: (_, rec) => (
                        <Space>
                          <Button 
                            type="text" 
                            icon={<EditOutlined />} 
                            onClick={() => {
                              setEditingCategory(rec);
                              categoryForm.setFieldsValue(rec);
                              setCategoryModalOpen(true);
                            }} 
                          />
                          {rec.is_active && (
                            <Popconfirm
                              title="¿Desactivar categoría?"
                              description="No se podrá usar para clasificar nuevos gastos."
                              onConfirm={() => handleDeleteCategory(rec.id)}
                            >
                              <Button type="text" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          )}
                        </Space>
                      ),
                      width: 120
                    }
                  ]}
                />
              </Card>
            )
          }
        ]}
      />

      {/* ────────────────────────────────────────────────────────────── */}
      {/* MODALES                                                        */}
      {/* ────────────────────────────────────────────────────────────── */}

      {/* MODAL: CARGAR XML FACTURA */}
      <Modal
        title={<strong>Registrar Gasto con Factura XML (CFDI 4.0)</strong>}
        open={invoiceModalOpen}
        onCancel={() => {
          setInvoiceModalOpen(false);
          invoiceForm.resetFields();
          setXmlFileList([]);
          setPdfFileList([]);
          setXmlValidation(null);
        }}
        footer={null}
        width={720}
        destroyOnClose
      >
        <Form
          form={invoiceForm}
          layout="vertical"
          onFinish={handleSaveInvoice}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Archivo XML (CFDI 4.0)" required>
                {xmlFileList.length === 0 ? (
                  <Upload
                    accept=".xml"
                    beforeUpload={handleXmlUpload}
                    fileList={xmlFileList}
                    showUploadList={false}
                  >
                    <Button icon={<UploadOutlined />} style={{ width: '100%' }}>Seleccionar XML</Button>
                  </Upload>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{
                      flex: 1, 
                      padding: '8px 12px', 
                      background: '#e6f7ff', 
                      border: '1px dashed #91d5ff',
                      borderRadius: 6,
                      fontSize: 13,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      <FileTextOutlined style={{ marginRight: 8, color: '#1890ff' }} />
                      {xmlFileList[0].name}
                    </div>
                    <Button 
                      danger 
                      type="primary"
                      icon={<DeleteOutlined />} 
                      onClick={() => {
                        setXmlFileList([]);
                        setXmlValidation(null);
                      }}
                      style={{ height: 38, width: 40 }}
                    />
                  </div>
                )}
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Archivo PDF (Factura digital)">
                {pdfFileList.length === 0 ? (
                  <Upload
                    accept=".pdf"
                    beforeUpload={(file) => {
                      setPdfFileList([file]);
                      return false;
                    }}
                    fileList={pdfFileList}
                    showUploadList={false}
                  >
                    <Button icon={<UploadOutlined />} style={{ width: '100%' }}>Seleccionar PDF</Button>
                  </Upload>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{
                      flex: 1, 
                      padding: '8px 12px', 
                      background: '#fff0f6', 
                      border: '1px dashed #ffadd2',
                      borderRadius: 6,
                      fontSize: 13,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      <FilePdfOutlined style={{ marginRight: 8, color: '#eb2f96' }} />
                      {pdfFileList[0].name}
                    </div>
                    <Button 
                      danger 
                      type="primary"
                      icon={<DeleteOutlined />} 
                      onClick={() => setPdfFileList([])}
                      style={{ height: 38, width: 40 }}
                    />
                  </div>
                )}
              </Form.Item>
            </Col>
          </Row>

          {isValidatingXml && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <LoadingOutlined style={{ fontSize: 24, marginBottom: 8 }} />
              <div>Validando estructura del XML de acuerdo a las reglas del SAT...</div>
            </div>
          )}

          {xmlValidation && (
            <Card 
              size="small" 
              title={<span style={{ fontWeight: 600 }}>Filtro de Reglas de Caja Chica (SAT / CICESE)</span>}
              style={{ marginBottom: 16, border: xmlValidation.is_valid ? '1px solid #b7eb8f' : '1px solid #ffccc7' }}
              headStyle={{ background: xmlValidation.is_valid ? '#f6ffed' : '#fff2f0' }}
            >
              {xmlValidation.is_valid ? (
                <Alert 
                  message="Validación Fiscal Aprobada" 
                  description="Los datos del receptor coinciden y el monto se encuentra bajo el límite de $5,000.00 MXN." 
                  type="success" 
                  showIcon 
                  style={{ marginBottom: 16 }}
                />
              ) : (
                <Alert 
                  message="Factura No Cumple con las Reglas" 
                  description={
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {xmlValidation.errors.map((err, idx) => <li key={idx}>{err}</li>)}
                    </ul>
                  }
                  type="error" 
                  showIcon 
                  style={{ marginBottom: 16 }}
                />
              )}

              <Row gutter={[16, 8]} style={{ fontSize: 12 }}>
                <Col span={12}><strong>Folio Fiscal (UUID):</strong> <span style={{ fontFamily: 'monospace' }}>{xmlValidation.uuid || 'N/A'}</span></Col>
                <Col span={12}><strong>Proveedor:</strong> {xmlValidation.emisor_nombre || 'N/A'} ({xmlValidation.emisor_rfc})</Col>
                <Col span={8}><strong>Total Factura:</strong> <strong>${xmlValidation.total?.toFixed(2)}</strong> {xmlValidation.moneda}</Col>
                <Col span={8}><strong>Subtotal:</strong> ${xmlValidation.subtotal?.toFixed(2)}</Col>
                <Col span={8}><strong>IVA:</strong> ${xmlValidation.iva?.toFixed(2)}</Col>
                <Col span={8}><strong>Método:</strong> {xmlValidation.metodo_pago} (PUE req.)</Col>
                <Col span={8}><strong>Forma Pago:</strong> {xmlValidation.forma_pago} (01/03 req.)</Col>
                <Col span={8}><strong>Uso CFDI:</strong> {xmlValidation.uso_cfdi} (G03 req.)</Col>
              </Row>
            </Card>
          )}

          <Form.Item 
            label="Clasificación de Categoría" 
            name="category_id"
            rules={[{ required: true, message: 'Selecciona una categoría de gasto.' }]}
          >
            <Select placeholder="Selecciona la categoría correspondiente">
              {categories.filter(c => c.is_active).map(cat => (
                <Select.Option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name} ({cat.group})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item 
            label="Descripción del Gasto" 
            name="description"
            rules={[{ required: true, message: 'Ingresa una descripción del propósito del gasto.' }]}
          >
            <TextArea rows={2} placeholder="Propósito del gasto (ej. Compra de insumos de papelería)" />
          </Form.Item>

          <Form.Item style={{ margin: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setInvoiceModalOpen(false)}>Cancelar</Button>
              <Button 
                type="primary" 
                htmlType="submit" 
                loading={loading}
                disabled={!xmlValidation || !xmlValidation.is_valid}
                style={{ borderRadius: 6 }}
              >
                Registrar
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* MODAL: EDITAR GASTO / FACTURA */}
      <Modal
        title={
          <strong>
            {selectedInvoiceForEdit?.is_manual 
              ? "Editar Gasto Manual (Sin XML)" 
              : "Editar Gasto/Factura (XML)"}
          </strong>
        }
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setSelectedInvoiceForEdit(null);
          editForm.resetFields();
        }}
        footer={null}
        width={600}
        destroyOnClose
      >
        {selectedInvoiceForEdit && (
          <Form
            form={editForm}
            layout="vertical"
            onFinish={handleUpdateInvoice}
          >
            {!selectedInvoiceForEdit.is_manual && (
              <Alert 
                message="Factura Formal SAT"
                description="Los datos fiscales (Fecha, Proveedor, RFC y Total) se leyeron del XML oficial y no son editables. Solo puedes reclasificar la categoría o modificar la descripción."
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item 
                  label="Fecha de Gasto" 
                  name="fecha_emision" 
                  rules={[{ required: true, message: 'Ingresa la fecha.' }]}
                >
                  <DatePicker 
                    style={{ width: '100%' }} 
                    disabled={!selectedInvoiceForEdit.is_manual} 
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item 
                  label="Monto Total (Max $5,000)" 
                  name="total" 
                  rules={[{ required: true, message: 'Ingresa el monto total.' }]}
                >
                  <InputNumber 
                    min={0.01} 
                    max={5000.00} 
                    precision={2} 
                    style={{ width: '100%' }} 
                    disabled={!selectedInvoiceForEdit.is_manual}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item 
                  label="RFC del Proveedor" 
                  name="emisor_rfc" 
                  rules={[{ required: true, message: 'Ingresa el RFC del proveedor.' }]}
                >
                  <Input 
                    placeholder="RFC de 12 o 13 caracteres" 
                    maxLength={13} 
                    disabled={!selectedInvoiceForEdit.is_manual} 
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item 
                  label="Nombre del Proveedor" 
                  name="emisor_nombre" 
                  rules={[{ required: true, message: 'Ingresa el nombre del proveedor.' }]}
                >
                  <Input 
                    placeholder="Razón Social o Nombre" 
                    disabled={!selectedInvoiceForEdit.is_manual} 
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item 
              label="Clasificación de Categoría" 
              name="category_id"
              rules={[{ required: true, message: 'Selecciona una categoría de gasto.' }]}
            >
              <Select placeholder="Selecciona la categoría correspondiente">
                {categories.filter(c => c.is_active || c.id === selectedInvoiceForEdit.category_id).map(cat => (
                  <Select.Option key={cat.id} value={cat.id}>
                    {cat.icon} {cat.name} ({cat.group})
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item 
              label="Descripción del Gasto" 
              name="description"
              rules={[{ required: true, message: 'Ingresa una descripción del propósito del gasto.' }]}
            >
              <TextArea rows={3} placeholder="Propósito del gasto" />
            </Form.Item>

            <Form.Item style={{ margin: 0, textAlign: 'right' }}>
              <Space>
                <Button onClick={() => {
                  setEditModalOpen(false);
                  setSelectedInvoiceForEdit(null);
                  editForm.resetFields();
                }}>
                  Cancelar
                </Button>
                <Button 
                  type="primary" 
                  htmlType="submit" 
                  loading={loading}
                  style={{ borderRadius: 6 }}
                >
                  Guardar Cambios
                </Button>
              </Space>
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* MODAL: PREVISUALIZAR PDF INTEGRADO */}
      <Modal
        title={<strong>Previsualización de Documento</strong>}
        open={pdfPreviewOpen}
        onCancel={() => {
          setPdfPreviewOpen(false);
          setPdfPreviewUrl('');
        }}
        footer={[
          <Button key="close" onClick={() => {
            setPdfPreviewOpen(false);
            setPdfPreviewUrl('');
          }}>
            Cerrar
          </Button>,
          <Button 
            key="download" 
            icon={<DownloadOutlined />} 
            onClick={handleDownloadPdf}
          >
            Descargar PDF
          </Button>,
          <Button key="open-tab" type="primary" href={pdfPreviewUrl} target="_blank">
            Abrir en pestaña nueva
          </Button>
        ]}
        width={850}
        style={{ top: 40 }}
        destroyOnClose
      >
        {pdfPreviewUrl ? (
          <div style={{ height: '65vh', background: '#f0f2f5', borderRadius: 8, overflow: 'hidden' }}>
            <iframe 
              src={`${pdfPreviewUrl}#toolbar=0`} 
              width="100%" 
              height="100%" 
              style={{ border: 'none' }}
              title="PDF Preview"
            />
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <LoadingOutlined style={{ fontSize: 24, marginBottom: 8 }} />
            <div>Cargando documento...</div>
          </div>
        )}
      </Modal>

      {/* MODAL: REGISTRAR GASTO MANUAL SIN XML */}
      <Modal
        title={<strong>Registrar Gasto Sin Factura (Manual / Pendiente de XML)</strong>}
        open={manualModalOpen}
        onCancel={() => {
          setManualModalOpen(false);
          manualForm.resetFields();
        }}
        footer={null}
        width={600}
        destroyOnClose
      >
        <Form
          form={manualForm}
          layout="vertical"
          onFinish={handleSaveManualExpense}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item 
                label="Fecha de Gasto" 
                name="fecha_emision" 
                rules={[{ required: true, message: 'Ingresa la fecha.' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item 
                label="Monto Total (Max $5,000)" 
                name="total" 
                rules={[{ required: true, message: 'Ingresa el monto total.' }]}
              >
                <InputNumber min={0.01} max={5000.00} precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item 
            label="Nombre del Proveedor" 
            name="emisor_nombre" 
            rules={[{ required: true, message: 'Ingresa el nombre del proveedor.' }]}
          >
            <Input placeholder="Ej: Materiales Ensenada S.A." />
          </Form.Item>

          <Form.Item 
            label="RFC del Proveedor" 
            name="emisor_rfc" 
            rules={[
              { required: true, message: 'Ingresa el RFC.' },
              { min: 12, max: 13, message: 'El RFC debe tener 12 o 13 caracteres.' }
            ]}
          >
            <Input placeholder="Ej: MEN950101XYZ" style={{ textTransform: 'uppercase' }} />
          </Form.Item>

          <Form.Item 
            label="Categoría del Gasto" 
            name="category_id"
            rules={[{ required: true, message: 'Selecciona una categoría.' }]}
          >
            <Select placeholder="Selecciona la categoría">
              {categories.filter(c => c.is_active).map(cat => (
                <Select.Option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name} ({cat.group})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item 
            label="Descripción del Gasto (Justificación)" 
            name="description" 
            rules={[{ required: true, message: 'Escribe una justificación corta.' }]}
          >
            <TextArea rows={2} placeholder="Ej: Pago de pipa de agua para las oficinas del DEO" />
          </Form.Item>

          <Form.Item style={{ margin: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setManualModalOpen(false)}>Cancelar</Button>
              <Button type="primary" htmlType="submit" loading={loading} style={{ borderRadius: 6 }}>
                Guardar Gasto
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* MODAL: VINCULAR XML A GASTO MANUAL */}
      <Modal
        title={<strong>Vincular Factura XML a Gasto Manual</strong>}
        open={linkModalOpen}
        onCancel={() => {
          setLinkModalOpen(false);
          setLinkXmlFileList([]);
          setLinkPdfFileList([]);
          setLinkValidation(null);
        }}
        footer={null}
        width={700}
        destroyOnClose
      >
        {selectedInvoiceForLink && (
          <Alert
            message="Asociación de Factura"
            description={`Vinculando XML al gasto registrado de $${selectedInvoiceForLink.total.toFixed(2)} MXN a favor de '${selectedInvoiceForLink.emisor_nombre}'.`}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <Form layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Archivo XML (SAT)" required>
                {linkXmlFileList.length === 0 ? (
                  <Upload
                    accept=".xml"
                    beforeUpload={handleLinkXmlUpload}
                    fileList={linkXmlFileList}
                    showUploadList={false}
                  >
                    <Button icon={<UploadOutlined />} style={{ width: '100%' }}>Seleccionar XML</Button>
                  </Upload>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{
                      flex: 1, 
                      padding: '8px 12px', 
                      background: '#e6f7ff', 
                      border: '1px dashed #91d5ff',
                      borderRadius: 6,
                      fontSize: 13,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      <FileTextOutlined style={{ marginRight: 8, color: '#1890ff' }} />
                      {linkXmlFileList[0].name}
                    </div>
                    <Button 
                      danger 
                      type="primary"
                      icon={<DeleteOutlined />} 
                      onClick={() => {
                        setLinkXmlFileList([]);
                        setLinkValidation(null);
                      }}
                      style={{ height: 38, width: 40 }}
                    />
                  </div>
                )}
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Archivo PDF (Opcional)">
                {linkPdfFileList.length === 0 ? (
                  <Upload
                    accept=".pdf"
                    beforeUpload={(file) => {
                      setLinkPdfFileList([file]);
                      return false;
                    }}
                    fileList={linkPdfFileList}
                    showUploadList={false}
                  >
                    <Button icon={<UploadOutlined />} style={{ width: '100%' }}>Seleccionar PDF</Button>
                  </Upload>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{
                      flex: 1, 
                      padding: '8px 12px', 
                      background: '#fff0f6', 
                      border: '1px dashed #ffadd2',
                      borderRadius: 6,
                      fontSize: 13,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      <FilePdfOutlined style={{ marginRight: 8, color: '#eb2f96' }} />
                      {linkPdfFileList[0].name}
                    </div>
                    <Button 
                      danger 
                      type="primary"
                      icon={<DeleteOutlined />} 
                      onClick={() => setLinkPdfFileList([])}
                      style={{ height: 38, width: 40 }}
                    />
                  </div>
                )}
              </Form.Item>
            </Col>
          </Row>

          {isLinkValidating && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <LoadingOutlined /> Validando correspondencia del XML...
            </div>
          )}

          {linkValidation && (
            <Card 
              size="small" 
              style={{ marginBottom: 16, border: linkValidation.is_valid ? '1px solid #b7eb8f' : '1px solid #ffccc7' }}
              headStyle={{ background: linkValidation.is_valid ? '#f6ffed' : '#fff2f0' }}
            >
              {linkValidation.is_valid ? (
                <Alert 
                  message="Factura Coincide" 
                  description="Los datos fiscales de la factura son válidos y corresponden al gasto manual." 
                  type="success" 
                  showIcon 
                  style={{ marginBottom: 12 }}
                />
              ) : (
                <Alert 
                  message="No Coincide o Errores de Validación" 
                  description={
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {linkValidation.errors.map((err, idx) => <li key={idx}>{err}</li>)}
                    </ul>
                  }
                  type="error" 
                  showIcon 
                  style={{ marginBottom: 12 }}
                />
              )}
            </Card>
          )}

          <Form.Item style={{ margin: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setLinkModalOpen(false)}>Cancelar</Button>
              <Button 
                type="primary" 
                disabled={!linkValidation || !linkValidation.is_valid}
                onClick={handleLinkXmlSave}
                loading={loading}
              >
                Vincular y Cerrar
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* MODAL: CONFIGURAR SALDO DEL FONDO */}
      <Modal
        title={<strong>Configurar Fondo Asignado (Caja Chica)</strong>}
        open={settingsModalOpen}
        onCancel={() => setSettingsModalOpen(false)}
        onOk={handleSaveSettings}
        okText="Actualizar Monto"
        cancelText="Cancelar"
      >
        <Paragraph>Modifica el saldo total asignado institucionalmente para el fondo fijo del DEO.</Paragraph>
        <Form.Item label="Monto Asignado ($ MXN)">
          <InputNumber 
            min={1} 
            max={200000} 
            value={newAssignedBalance} 
            onChange={setNewAssignedBalance} 
            style={{ width: '100%' }}
          />
        </Form.Item>
      </Modal>

      {/* MODAL: CREAR REPOSICIÓN */}
      <Modal
        title={<strong>Crear Solicitud de Reposición (Consolidado)</strong>}
        open={reimbModalOpen}
        onCancel={() => setReimbModalOpen(false)}
        footer={null}
        width={850}
        destroyOnClose
      >
        <Paragraph>
          Consolida facturas con estado <strong>Pendiente</strong> para enviar a reembolso.
          Se debe respetar el límite de **máximo 15 facturas** en total.
        </Paragraph>

        {pendingInvoices.length === 0 ? (
          <Alert
            message="No hay facturas pendientes"
            description="Todos los gastos ya están asociados a paquetes de reposición."
            type="info"
            showIcon
            style={{ marginBottom: 20 }}
          />
        ) : (
          <div>
            <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16, border: '1px solid #eee', borderRadius: 8 }}>
              <Table
                dataSource={pendingInvoices}
                rowKey="id"
                pagination={false}
                size="small"
                rowSelection={{
                  selectedRowKeys: selectedInvoiceIds,
                  onChange: setSelectedInvoiceIds
                }}
                columns={[
                  { title: 'Fecha Gasto', dataIndex: 'fecha_emision', render: (d) => dayjs(d).format('DD/MM/YYYY') },
                  { title: 'Folio', dataIndex: 'folio', render: (f, rec) => f || (rec.is_manual ? 'Gasto Manual' : 'S/F') },
                  { title: 'Proveedor', dataIndex: 'emisor_nombre', ellipsis: true },
                  { title: 'RFC', dataIndex: 'emisor_rfc' },
                  { title: 'Categoría', dataIndex: 'category', render: (c) => c ? `${c.icon} ${c.name}` : '' },
                  { title: 'Total', dataIndex: 'total', align: 'right', render: (t) => <strong>${t.toFixed(2)}</strong> }
                ]}
              />
            </div>

            {(() => {
              const val = getReimbursementValidation();
              return (
                <div style={{ marginBottom: 20 }}>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Card size="small" style={{ background: '#fafafa' }}>
                        <div>Gastos Seleccionados: <strong>{selectedInvoiceIds.length} / 15</strong></div>
                        <Progress 
                          percent={Math.min((selectedInvoiceIds.length / 15) * 100, 100)} 
                          status={selectedInvoiceIds.length > 15 ? "exception" : "normal"}
                          showInfo={false}
                          style={{ margin: '8px 0' }}
                        />
                      </Card>
                    </Col>
                    <Col span={12}>
                      <Card size="small" style={{ background: '#fafafa' }}>
                        <div>Monto Consolidado a Cobrar:</div>
                        <Title level={3} style={{ margin: '4px 0', color: val.valid ? '#52c41a' : '#bfbfbf' }}>
                          ${val.valid ? val.total.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '0.00'} MXN
                        </Title>
                      </Card>
                    </Col>
                  </Row>

                  {!val.valid && selectedInvoiceIds.length > 0 && (
                    <Alert
                      message="Paquete no Válido"
                      description={val.reason}
                      type="error"
                      showIcon
                      style={{ marginTop: 12 }}
                    />
                  )}
                </div>
              );
            })()}

            <Form layout="vertical">
              <Form.Item label="Notas y Justificación del Paquete">
                <TextArea 
                  rows={2} 
                  value={reimbNotes}
                  onChange={(e) => setReimbNotes(e.target.value)}
                  placeholder="Comentarios adicionales" 
                />
              </Form.Item>

              <Form.Item style={{ margin: 0, textAlign: 'right' }}>
                <Space>
                  <Button onClick={() => setReimbModalOpen(false)}>Cancelar</Button>
                  <Button 
                    type="primary" 
                    onClick={handleCreateReimbursement}
                    disabled={!getReimbursementValidation().valid}
                    style={{ borderRadius: 6 }}
                  >
                    Crear Reposición
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>

      {/* MODAL: SUBIR PDF ESCANEADO CON FIRMAS */}
      <Modal
        title={<strong>Subir Comprobante Escaneado (Firmado)</strong>}
        open={scanModalOpen}
        onCancel={() => {
          setScanModalOpen(false);
          setScanFileList([]);
          setSelectedReimbForScan(null);
        }}
        footer={null}
        destroyOnClose
      >
        <Paragraph>
          Sube el archivo PDF firmado por contabilidad de la reposición {selectedReimbForScan?.folio}.
        </Paragraph>

        <Form layout="vertical" onFinish={handleUploadScan}>
          <Form.Item label="Archivo PDF firmado" required>
            <Upload
              accept=".pdf"
              beforeUpload={(file) => {
                setScanFileList([file]);
                return false;
              }}
              fileList={scanFileList}
              onRemove={() => setScanFileList([])}
              maxCount={1}
            >
              <Button icon={<UploadOutlined />} style={{ width: '100%' }}>Seleccionar PDF</Button>
            </Upload>
          </Form.Item>

          <Form.Item style={{ margin: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setScanModalOpen(false)}>Cancelar</Button>
              <Button 
                type="primary" 
                htmlType="submit"
                disabled={!scanFileList.length}
                style={{ borderRadius: 6 }}
              >
                Cargar Archivo
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* MODAL: AGREGAR/EDITAR CATEGORÍA */}
      <Modal
        title={<strong>{editingCategory ? 'Editar Categoría' : 'Nueva Categoría de Gasto'}</strong>}
        open={categoryModalOpen}
        onCancel={() => {
          setCategoryModalOpen(false);
          categoryForm.resetFields();
          setEditingCategory(null);
        }}
        footer={null}
        destroyOnClose
      >
        <Form
          form={categoryForm}
          layout="vertical"
          onFinish={handleSaveCategory}
        >
          <Form.Item 
            label="Nombre de Categoría" 
            name="name"
            rules={[{ required: true, message: 'Ingresa el nombre de la categoría.' }]}
          >
            <Input placeholder="Ej: Herramientas menores" />
          </Form.Item>

          <Form.Item 
            label="Grupo" 
            name="group"
            rules={[{ required: true, message: 'Selecciona el grupo agrupador.' }]}
          >
            <Select placeholder="Selecciona el grupo">
              <Select.Option value="materiales">Materiales</Select.Option>
              <Select.Option value="servicios">Servicios</Select.Option>
              <Select.Option value="otros">Otros</Select.Option>
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Ícono (Emoji)" name="icon" initialValue="📦">
                <Input placeholder="Ej: 🔧, ⛽, 💻" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Color CSS" name="color" initialValue="#7f8c8d">
                <Input placeholder="Ej: #1890ff, #52c41a" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item style={{ margin: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setCategoryModalOpen(false);
                categoryForm.resetFields();
                setEditingCategory(null);
              }}>
                Cancelar
              </Button>
              <Button type="primary" htmlType="submit" style={{ borderRadius: 6 }}>
                Guardar
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

    </div>
  );
}
