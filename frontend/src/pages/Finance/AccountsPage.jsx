/**
 * SIAE — Módulo de Estados de Cuenta y Movimientos (Finanzas)
 * Permite visualizar el saldo al corriente y flujos de cuentas, registrar cargos y abonos manuales,
 * y visualizar transacciones vinculadas automáticamente de Caja Chica.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Row,
  Col,
  Card,
  Statistic,
  Table,
  Button,
  Tag,
  Space,
  Input,
  Select,
  DatePicker,
  Modal,
  Form,
  InputNumber,
  Tooltip,
  Typography,
  message,
  Popconfirm,
  Badge,
} from 'antd';
import {
  BankOutlined,
  PlusOutlined,
  MinusOutlined,
  SearchOutlined,
  LockOutlined,
  EditOutlined,
  DeleteOutlined,
  SyncOutlined,
  DollarOutlined,
  InfoCircleOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { Title, Text, Paragraph } = Typography;

export default function AccountsPage() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  
  // Estados
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [statementData, setStatementData] = useState({ items: [], total: 0, account_name: '', account_balance: 0 });
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [categories, setCategories] = useState([]);
  
  // Parámetros de búsqueda y paginación
  const [queryParams, setQueryParams] = useState({
    skip: 0,
    limit: 15,
    type: undefined,
    start_date: undefined,
    end_date: undefined,
    search: undefined,
  });

  // Modal cuenta
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountForm] = Form.useForm();
  
  // Modal transacciones
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [savingTx, setSavingTx] = useState(false);
  const [txForm] = Form.useForm();
  const txType = Form.useWatch('type', txForm);
  
  const selectedAccount = accounts.find(acc => acc.id === selectedAccountId);
  const isFondoFijo = selectedAccount && (
    selectedAccount.name.toLowerCase().includes('fondo fijo') ||
    selectedAccount.name.toLowerCase().includes('caja chica')
  );

  // Colores temáticos por cuenta determinados de forma dinámica
  const getAccountStyle = (acc, index) => {
    if (!acc) return { border: '4px solid #fa8c16', color: '#fa8c16', bg: 'linear-gradient(135deg, #fff7e6 0%, #ffd591 100%)', badge: 'orange' };
    const name = (acc.name || '').toLowerCase();
    if (name.includes('fondo fijo') || name.includes('caja chica')) {
      return { border: '4px solid #1890ff', color: '#1890ff', bg: 'linear-gradient(135deg, #e6f7ff 0%, #bae7ff 100%)', badge: 'blue' };
    }
    const colors = [
      { border: '4px solid #52c41a', color: '#52c41a', bg: 'linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%)', badge: 'green' },
      { border: '4px solid #722ed1', color: '#722ed1', bg: 'linear-gradient(135deg, #f9f0ff 0%, #efdbff 100%)', badge: 'purple' },
      { border: '4px solid #fa8c16', color: '#fa8c16', bg: 'linear-gradient(135deg, #fff7e6 0%, #ffd591 100%)', badge: 'orange' },
      { border: '4px solid #eb2f96', color: '#eb2f96', bg: 'linear-gradient(135deg, #fff0f6 0%, #ffd6e7 100%)', badge: 'pink' },
      { border: '4px solid #13c2c2', color: '#13c2c2', bg: 'linear-gradient(135deg, #e6fffb 0%, #b5f5ec 100%)', badge: 'cyan' }
    ];
    return colors[index % colors.length];
  };

  // Cargar cuentas
  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/accounts');
      setAccounts(res.data);
      if (res.data.length > 0 && !selectedAccountId) {
        setSelectedAccountId(res.data[0].id);
      }
    } catch (err) {
      message.error("Error al cargar las cuentas.");
    } finally {
      setLoading(false);
    }
  };

  // Cargar categorías financieras
  const loadCategories = async () => {
    try {
      const res = await apiClient.get('/petty-cash/categories?active_only=true');
      setCategories(res.data);
    } catch (err) {
      console.error("Error al cargar las categorías financieras:", err);
    }
  };

  // Cargar transacciones
  const loadTransactions = async () => {
    if (!selectedAccountId) return;
    setLoadingTransactions(true);
    try {
      const res = await apiClient.get(`/accounts/${selectedAccountId}/transactions`, {
        params: queryParams,
      });
      setStatementData(res.data);
    } catch (err) {
      message.error("Error al cargar el estado de cuenta.");
    } finally {
      setLoadingTransactions(false);
    }
  };

  useEffect(() => {
    loadAccounts();
    loadCategories();
  }, []);

  useEffect(() => {
    if (selectedAccountId) {
      setQueryParams(prev => ({ ...prev, skip: 0 }));
      loadTransactions();
    }
  }, [selectedAccountId]);

  useEffect(() => {
    if (selectedAccountId) {
      loadTransactions();
    }
  }, [queryParams]);

  // Manejar creación de cuenta
  const handleSaveAccount = async () => {
    try {
      const values = await accountForm.validateFields();
      setSavingAccount(true);
      
      const payload = {
        name: values.name,
        account_number: values.account_number || null,
        description: values.description || null,
        initial_balance: values.initial_balance || 0.0,
        is_active: true
      };

      await apiClient.post('/accounts', payload);
      message.success("Cuenta creada exitosamente.");
      setAccountModalOpen(false);
      accountForm.resetFields();
      loadAccounts();
    } catch (err) {
      if (err.response?.data?.detail) {
        message.error(err.response.data.detail);
      } else {
        message.error("Error al guardar la cuenta.");
      }
    } finally {
      setSavingAccount(false);
    }
  };

  // Manejar creación/edición de transacciones
  const handleSaveTransaction = async () => {
    try {
      const values = await txForm.validateFields();
      setSavingTx(true);

      const payload = {
        type: values.type,
        amount: values.amount,
        concept: values.concept,
        reference: values.reference || null,
        origin_dest_account: values.origin_dest_account || null,
        category_id: values.category_id || null,
        description: values.description || null,
        transaction_date: values.transaction_date ? values.transaction_date.toISOString() : null,
      };

      if (editingTx) {
        await apiClient.put(`/accounts/${selectedAccountId}/transactions/${editingTx.id}`, payload);
        message.success("Movimiento actualizado correctamente.");
      } else {
        await apiClient.post(`/accounts/${selectedAccountId}/transactions`, payload);
        message.success("Movimiento registrado correctamente.");
      }
      
      setTxModalOpen(false);
      txForm.resetFields();
      setEditingTx(null);
      loadTransactions();
      loadAccounts(); // Recargar saldos en tarjetas
    } catch (err) {
      if (err.response?.data?.detail) {
        message.error(err.response.data.detail);
      } else {
        message.error("Error al registrar el movimiento.");
      }
    } finally {
      setSavingTx(false);
    }
  };

  // Eliminar transacción
  const handleDeleteTransaction = async (txId) => {
    try {
      await apiClient.delete(`/accounts/${selectedAccountId}/transactions/${txId}`);
      message.success("Movimiento eliminado correctamente.");
      loadTransactions();
      loadAccounts();
    } catch (err) {
      if (err.response?.data?.detail) {
        message.error(err.response.data.detail);
      } else {
        message.error("Error al eliminar el movimiento.");
      }
    }
  };

  // Abrir modal de edición
  const handleEditTxOpen = (tx) => {
    setEditingTx(tx);
    txForm.setFieldsValue({
      concept: tx.concept,
      type: tx.type,
      amount: tx.amount,
      reference: tx.reference,
      origin_dest_account: tx.origin_dest_account,
      category_id: tx.category_id,
      description: tx.description,
      transaction_date: dayjs(tx.transaction_date),
    });
    setTxModalOpen(true);
  };

  // Calcular abonos/cargos de la vista actual
  const currentCredits = statementData.items
    .filter(t => t.type === 'abono')
    .reduce((sum, t) => sum + t.amount, 0);

  const currentDebits = statementData.items
    .filter(t => t.type === 'cargo')
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <div style={{ padding: '4px 0' }}>
      {/* HEADER Y ACCIÓN GENERAL */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={3} style={{ margin: 0, color: '#0A2647', fontWeight: 700 }}>
            <BankOutlined /> Estados de Cuenta
          </Title>
          <Text type="secondary">Lleva el control exacto de cargos, abonos y saldos acumulados de los fondos asignados.</Text>
        </div>
        {hasPermission('accounts', 'create') && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="large"
            style={{ borderRadius: 8, background: 'linear-gradient(135deg, #1B4F72, #2C74B3)', border: 'none' }}
            onClick={() => {
              accountForm.resetFields();
              setAccountModalOpen(true);
            }}
          >
            Nueva Cuenta
          </Button>
        )}
      </div>

      {/* GRID DE TARJETAS DE CUENTAS */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {accounts.map((acc, index) => {
          const style = getAccountStyle(acc, index);
          const isSelected = selectedAccountId === acc.id;

          return (
            <Col xs={24} sm={12} md={8} key={acc.id}>
              <Card
                hoverable
                onClick={() => setSelectedAccountId(acc.id)}
                style={{
                  borderRadius: 12,
                  borderLeft: style.border,
                  border: isSelected ? `2px solid ${style.color}` : '1px solid #f0f0f0',
                  boxShadow: isSelected ? '0 4px 16px rgba(0,0,0,0.1)' : '0 2px 8px rgba(0,0,0,0.03)',
                  background: isSelected ? '#fff' : '#fafafa',
                  transition: 'all 0.3s ease',
                  transform: isSelected ? 'translateY(-2px)' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <Badge status={acc.is_active ? "success" : "default"} text={
                      <Text strong style={{ fontSize: 16, color: '#333' }}>{acc.name}</Text>
                    } />
                    {acc.account_number && (
                      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                        Nº: {acc.account_number}
                      </div>
                    )}
                  </div>
                  <BankOutlined style={{ fontSize: 20, color: style.color }} />
                </div>
                <div style={{ marginTop: 16, textAlign: 'right' }}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Saldo disponible</Text>
                  <Text style={{ fontSize: 22, fontWeight: 700, color: acc.balance >= 0 ? '#3f8600' : '#cf1322' }}>
                    ${acc.balance.toLocaleString('es-MX', { minimumFractionDigits: 2 })} <span style={{ fontSize: 12, fontWeight: 500 }}>MXN</span>
                  </Text>
                </div>
              </Card>
            </Col>
          );
        })}
      </Row>

      {/* PANEL DE DETALLE DE LA CUENTA SELECCIONADA */}
      {selectedAccountId && (
        <Row gutter={[24, 24]}>
          {/* BANNER PRINCIPAL DE SALDO Y RESUMEN DE FLUJO */}
          <Col xs={24} lg={8}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* HERO CARD DE SALDO */}
              <Card
                bordered={false}
                style={{
                  borderRadius: 16,
                  background: 'linear-gradient(135deg, #0A2647 0%, #1B4F72 60%, #205295 100%)',
                  boxShadow: '0 8px 24px rgba(10,38,71,0.15)',
                  color: '#fff',
                }}
              >
                <div style={{ marginBottom: 20 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                    Cuenta Seleccionada
                  </Text>
                  <Title level={3} style={{ color: '#fff', margin: '4px 0 0 0', fontWeight: 700 }}>
                    {statementData.account_name || 'Cargando...'}
                  </Title>
                </div>
                
                <Statistic
                  title={<span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 500 }}>Saldo al Corriente</span>}
                  value={statementData.account_balance}
                  precision={2}
                  suffix={<span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16 }}>MXN</span>}
                  valueStyle={{ color: '#fff', fontWeight: 800, fontSize: 32 }}
                />

                {!isFondoFijo && hasPermission('accounts', 'create') ? (
                  <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      block
                      style={{
                        background: '#52c41a',
                        borderColor: '#52c41a',
                        borderRadius: 8,
                        fontWeight: 600,
                      }}
                      onClick={() => {
                        txForm.resetFields();
                        txForm.setFieldsValue({ type: 'abono', transaction_date: dayjs() });
                        setEditingTx(null);
                        setTxModalOpen(true);
                      }}
                    >
                      Abono
                    </Button>
                    <Button
                      danger
                      type="primary"
                      icon={<MinusOutlined />}
                      block
                      style={{
                        borderRadius: 8,
                        fontWeight: 600,
                      }}
                      onClick={() => {
                        txForm.resetFields();
                        txForm.setFieldsValue({ type: 'cargo', transaction_date: dayjs() });
                        setEditingTx(null);
                        setTxModalOpen(true);
                      }}
                    >
                      Cargo
                    </Button>
                  </div>
                ) : isFondoFijo ? (
                  <div style={{ marginTop: 16, padding: '12px', background: 'rgba(255, 255, 255, 0.15)', borderRadius: 8, textAlign: 'center' }}>
                    <Paragraph style={{ color: '#fff', fontSize: 12, margin: 0 }}>
                      <InfoCircleOutlined style={{ marginRight: 6 }} />
                      Los movimientos del Fondo Fijo se administran automáticamente desde su propio módulo.
                    </Paragraph>
                    <Button 
                      type="link" 
                      onClick={() => navigate('/finance/petty-cash')} 
                      style={{ color: '#bae7ff', padding: 0, height: 'auto', marginTop: 4, fontWeight: 600 }}
                    >
                      Ir al Módulo de Fondo Fijo →
                    </Button>
                  </div>
                ) : null}
              </Card>

              {/* TARJETA DE RESUMEN DE FLUJOS EN RANGO */}
              <Card
                title={<span style={{ fontWeight: 700, color: '#333' }}>Flujo del Período Filtrado</span>}
                bordered={false}
                style={{ borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      <ArrowUpOutlined style={{ color: '#52c41a' }} /> Total Abonos
                    </Text>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#3f8600', marginTop: 4 }}>
                      ${currentCredits.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      <ArrowDownOutlined style={{ color: '#ff4d4f' }} /> Total Cargos
                    </Text>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#cf1322', marginTop: 4 }}>
                      ${currentDebits.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
                
                {/* REPRESENTACIÓN DE FLUJO SIMPLE (BARRA DE PROPORCIÓN) */}
                {currentCredits + currentDebits > 0 ? (
                  <div>
                    <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', margin: '16px 0 8px 0' }}>
                      <div
                        style={{
                          width: `${(currentCredits / (currentCredits + currentDebits)) * 100}%`,
                          backgroundColor: '#52c41a',
                        }}
                      />
                      <div
                        style={{
                          width: `${(currentDebits / (currentCredits + currentDebits)) * 100}%`,
                          backgroundColor: '#ff4d4f',
                        }}
                      />
                    </div>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Porcentaje de ingresos vs gastos en este período filtrado.
                    </Text>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '10px 0', color: '#aaa', fontSize: 12 }}>
                    Sin transacciones registradas en este período.
                  </div>
                )}
              </Card>
            </div>
          </Col>

          {/* HISTORIAL Y FILTROS DEL ESTADO DE CUENTA */}
          <Col xs={24} lg={16}>
            <Card
              bordered={false}
              style={{ borderRadius: 16, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}
            >
              {/* FILTROS */}
              <div style={{ marginBottom: 20, padding: '16px', background: '#fafafa', borderRadius: 12, border: '1px solid #f0f0f0' }}>
                <Row gutter={[12, 12]} align="middle">
                  <Col xs={24} sm={12} md={8}>
                    <Input
                      placeholder="Buscar por concepto o ref..."
                      prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                      value={queryParams.search}
                      onChange={(e) => {
                        const val = e.target.value;
                        setQueryParams(prev => ({ ...prev, search: val || undefined, skip: 0 }));
                      }}
                      allowClear
                    />
                  </Col>
                  <Col xs={12} sm={6} md={5}>
                    <Select
                      placeholder="Tipo"
                      style={{ width: '100%' }}
                      value={queryParams.type}
                      onChange={(val) => setQueryParams(prev => ({ ...prev, type: val, skip: 0 }))}
                      allowClear
                    >
                      <Select.Option value="abono">Abono (+)</Select.Option>
                      <Select.Option value="cargo">Cargo (-)</Select.Option>
                    </Select>
                  </Col>
                  <Col xs={24} sm={12} md={8}>
                    <DatePicker.RangePicker
                      style={{ width: '100%' }}
                      value={queryParams.start_date ? [dayjs(queryParams.start_date), dayjs(queryParams.end_date)] : null}
                      onChange={(dates) => {
                        setQueryParams(prev => ({
                          ...prev,
                          start_date: dates ? dates[0].format('YYYY-MM-DD') : undefined,
                          end_date: dates ? dates[1].format('YYYY-MM-DD') : undefined,
                          skip: 0
                        }));
                      }}
                    />
                  </Col>
                  <Col xs={12} sm={6} md={3} style={{ textAlign: 'right' }}>
                    <Button
                      onClick={() => {
                        setQueryParams({
                          skip: 0,
                          limit: 15,
                          type: undefined,
                          start_date: undefined,
                          end_date: undefined,
                          search: undefined
                        });
                      }}
                      style={{ width: '100%', borderRadius: 6 }}
                    >
                      Limpiar
                    </Button>
                  </Col>
                </Row>
              </div>

              {/* TABLA DE MOVIMIENTOS */}
              <Table
                dataSource={statementData.items}
                rowKey="id"
                loading={loadingTransactions}
                pagination={{
                  total: statementData.total,
                  current: Math.floor(queryParams.skip / queryParams.limit) + 1,
                  pageSize: queryParams.limit,
                  onChange: (page, pageSize) => {
                    setQueryParams(prev => ({
                      ...prev,
                      skip: (page - 1) * pageSize,
                      limit: pageSize
                    }));
                  }
                }}
                columns={[
                  {
                    title: 'Fecha',
                    dataIndex: 'transaction_date',
                    key: 'transaction_date',
                    render: (d) => dayjs(d).format('DD/MM/YYYY HH:mm'),
                    width: 140,
                    sorter: (a, b) => dayjs(a.transaction_date || 0).unix() - dayjs(b.transaction_date || 0).unix(),
                    defaultSortOrder: 'descend',
                  },
                  {
                    title: 'Concepto / Proveedor',
                    key: 'concept_info',
                    render: (_, rec) => (
                      <div>
                        <div>
                          {(rec.petty_cash_invoice_id || rec.petty_cash_reimbursement_id) && (
                            <Tooltip title="Movimiento enlazado automáticamente con Fondo Fijo">
                              <LockOutlined style={{ color: '#fa8c16', marginRight: 6 }} />
                            </Tooltip>
                          )}
                          <Text strong>{rec.concept}</Text>
                        </div>
                        {rec.description && (
                          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{rec.description}</div>
                        )}
                        {rec.origin_dest_account && (
                          <div style={{ fontSize: 11, color: '#1B4F72', marginTop: 2 }}>
                            <span style={{ fontWeight: 600 }}>Cuenta origen/destino: </span>{rec.origin_dest_account}
                          </div>
                        )}
                        <Space size={4} style={{ marginTop: 4, flexWrap: 'wrap' }}>
                          {rec.petty_cash_invoice_id && (
                            <Tag color="orange" style={{ fontSize: 10, margin: 0 }}>Gasto Caja Chica</Tag>
                          )}
                          {rec.petty_cash_reimbursement_id && (
                            <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>Reposición Efectivo</Tag>
                          )}
                          {!(rec.petty_cash_invoice_id || rec.petty_cash_reimbursement_id) && (
                            <Tag color="cyan" style={{ fontSize: 10, margin: 0 }}>Manual / Ajuste</Tag>
                          )}
                          {rec.category_name && (
                            <Tag 
                              style={{ 
                                fontSize: 10, 
                                margin: 0, 
                                border: 'none', 
                                color: '#fff', 
                                backgroundColor: rec.category_color || '#d9d9d9' 
                              }}
                            >
                              {rec.category_icon} {rec.category_name}
                            </Tag>
                          )}
                        </Space>
                      </div>
                    ),
                    sorter: (a, b) => (a.concept || '').localeCompare(b.concept || ''),
                  },
                  {
                    title: 'Referencia',
                    dataIndex: 'reference',
                    key: 'reference',
                    render: (val) => val ? <Text code>{val}</Text> : '-',
                    width: 120,
                    sorter: (a, b) => (a.reference || '').localeCompare(b.reference || ''),
                  },
                  {
                    title: 'Monto',
                    key: 'amount_info',
                    align: 'right',
                    width: 130,
                    render: (_, rec) => {
                      const isAbono = rec.type === 'abono';
                      return (
                        <span style={{ fontWeight: 700, color: isAbono ? '#52c41a' : '#ff4d4f' }}>
                          {isAbono ? '+' : '-'}${rec.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </span>
                      );
                    },
                    sorter: (a, b) => (a.amount || 0) - (b.amount || 0),
                  },
                  {
                    title: 'Saldo al Corriente',
                    dataIndex: 'running_balance',
                    key: 'running_balance',
                    align: 'right',
                    width: 150,
                    render: (val) => (
                      <span style={{ fontWeight: 600, color: '#0A2647' }}>
                        ${val.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </span>
                    ),
                    sorter: (a, b) => (a.running_balance || 0) - (b.running_balance || 0),
                  },
                  {
                    title: 'Registró',
                    dataIndex: 'created_by_name',
                    key: 'created_by_name',
                    render: (val) => <Text style={{ fontSize: 12 }} type="secondary">{val || 'Sistema'}</Text>,
                    width: 110,
                    sorter: (a, b) => (a.created_by_name || '').localeCompare(b.created_by_name || ''),
                  },
                  {
                    title: 'Acciones',
                    key: 'actions',
                    align: 'center',
                    width: 100,
                    render: (_, rec) => {
                      const isLinked = rec.petty_cash_invoice_id || rec.petty_cash_reimbursement_id;
                      
                      if (isLinked) {
                        return (
                          <Tooltip title="Protegido: Este movimiento proviene de caja chica y no puede modificarse aquí.">
                            <LockOutlined style={{ color: '#bfbfbf', fontSize: 16 }} />
                          </Tooltip>
                        );
                      }
                      
                      return (
                        <Space>
                          {hasPermission('accounts', 'edit') && (
                            <Button
                              type="text"
                              size="small"
                              icon={<EditOutlined style={{ color: '#1890ff' }} />}
                              onClick={() => handleEditTxOpen(rec)}
                            />
                          )}
                          {hasPermission('accounts', 'delete') && (
                            <Popconfirm
                              title="¿Eliminar este movimiento?"
                              description="El saldo acumulado de la cuenta se recalculará."
                              onConfirm={() => handleDeleteTransaction(rec.id)}
                              okText="Sí"
                              cancelText="No"
                            >
                              <Button
                                type="text"
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                              />
                            </Popconfirm>
                          )}
                        </Space>
                      );
                    }
                  }
                ]}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* MODAL NUEVA CUENTA */}
      <Modal
        title={<span style={{ color: '#0A2647', fontWeight: 700 }}><BankOutlined /> Crear Nueva Cuenta Financiera</span>}
        open={accountModalOpen}
        onOk={handleSaveAccount}
        onCancel={() => setAccountModalOpen(false)}
        confirmLoading={savingAccount}
        okText="Crear Cuenta"
        cancelText="Cancelar"
        destroyOnClose
      >
        <Form form={accountForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="Nombre de la Cuenta"
            rules={[{ required: true, message: 'Ingresa el nombre de la cuenta' }]}
          >
            <Input placeholder="Ej. Fondo Fijo 2, Recursos Propios, Proyecto X" />
          </Form.Item>
          <Form.Item
            name="account_number"
            label="Número de Cuenta / Referencia"
          >
            <Input placeholder="Ej. BBVA 0123456789 o Clave interna" />
          </Form.Item>
          <Form.Item
            name="initial_balance"
            label="Saldo Inicial (Abono de Apertura)"
            initialValue={0.0}
            rules={[{ required: true, message: 'Ingresa el saldo inicial' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              precision={2}
              formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={value => value.replace(/\$\s?|(,*)/g, '')}
            />
          </Form.Item>
          <Form.Item
            name="description"
            label="Descripción / Propósito"
          >
            <Input.TextArea placeholder="Detalles de la fuente o destino de los fondos." rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* MODAL NUEVA/EDITAR TRANSACCIÓN */}
      <Modal
        title={
          <span style={{ color: '#0A2647', fontWeight: 700 }}>
            {editingTx ? 'Editar Movimiento Manual' : 'Registrar Movimiento Manual'}
          </span>
        }
        open={txModalOpen}
        onOk={handleSaveTransaction}
        onCancel={() => {
          setTxModalOpen(false);
          setEditingTx(null);
          txForm.resetFields();
        }}
        confirmLoading={savingTx}
        okText="Guardar"
        cancelText="Cancelar"
        destroyOnClose
      >
        <Form form={txForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="type"
            label="Tipo de Movimiento"
            rules={[{ required: true }]}
          >
            <Select disabled={editingTx !== null}>
              <Select.Option value="abono">Abono (Ingreso/Depósito)</Select.Option>
              <Select.Option value="cargo">Cargo (Egreso/Ajuste Negativo)</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="amount"
            label="Monto del Movimiento"
            rules={[{ required: true, message: 'Ingresa el monto del movimiento' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0.01}
              precision={2}
              formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={value => value.replace(/\$\s?|(,*)/g, '')}
            />
          </Form.Item>
          <Form.Item
            name="concept"
            label="Concepto"
            rules={[{ required: true, message: 'Ingresa el concepto del movimiento' }]}
          >
            <Input placeholder="Ej. Abono por depósito externo, Ajuste por centavos, etc." />
          </Form.Item>
          <Form.Item
            name="reference"
            label="Referencia / Folio"
          >
            <Input placeholder="Ej. Cheque, Nº Transferencia, Oficio..." />
          </Form.Item>
          <Form.Item
            name="category_id"
            label="Categoría Financiera (Opcional)"
          >
            <Select placeholder="Selecciona una clasificación de gasto" allowClear>
              {categories.map(cat => (
                <Select.Option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="transaction_date"
            label="Fecha y Hora de la Operación"
            rules={[{ required: true, message: 'Ingresa la fecha de la transacción' }]}
          >
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="origin_dest_account"
            label={txType === 'abono' ? "Cuenta Origen / Emisor (Opcional)" : "Cuenta Destino / Beneficiario (Opcional)"}
          >
            <Input placeholder="Ej. Dirección Administrativa, Cuenta Externa, Proyecto X..." />
          </Form.Item>
          <Form.Item
            name="description"
            label="Notas Adicionales"
          >
            <Input.TextArea placeholder="Notas u observaciones aclaratorias sobre el movimiento." rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
