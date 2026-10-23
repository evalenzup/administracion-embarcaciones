import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Checkbox, Select, Button, Space, Tag, Alert, message, Typography, Divider, Card, Spin } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined, TeamOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Option } = Select;

export default function TelegramAnnouncementModal({
  open,
  onClose,
  tramite,
  tramiteType = 'viatico' // 'viatico' | 'grc'
}) {
  const [form] = Form.useForm();
  const [sending, setSending] = useState(false);
  const [sendTitular, setSendTitular] = useState(true);
  const [sendAsistente, setSendAsistente] = useState(true);
  const [usersMap, setUsersMap] = useState({});
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Cargar lista de usuarios para verificar telegram_id en tiempo real
  useEffect(() => {
    if (open) {
      setLoadingUsers(true);
      apiClient.get('/users')
        .then((res) => {
          const map = {};
          const list = Array.isArray(res.data) ? res.data : (res.data?.items || []);
          list.forEach((u) => {
            map[u.id] = u;
          });
          setUsersMap(map);
        })
        .catch((err) => {
          console.error('Error al obtener usuarios para modal de Telegram:', err);
        })
        .finally(() => {
          setLoadingUsers(false);
        });
    }
  }, [open]);

  const isViatico = tramiteType === 'viatico';
  const folio = tramite ? (isViatico ? tramite.folio_comision : tramite.folio_episa) : '';
  
  // Resolver titular
  let titularUser = null;
  let titularNombre = 'Comisionado / Solicitante';
  if (tramite) {
    if (isViatico) {
      const personalUserId = tramite.personal?.user_id;
      if (personalUserId && usersMap[personalUserId]) {
        titularUser = usersMap[personalUserId];
      }
      titularNombre = titularUser?.full_name || (tramite.personal ? `${tramite.personal.first_name} ${tramite.personal.last_name}` : tramite.firma_solicitante_nombre || 'Comisionado');
    } else {
      const solId = tramite.solicitante_id || tramite.solicitante?.id;
      if (solId && usersMap[solId]) {
        titularUser = usersMap[solId];
      } else if (tramite.solicitante) {
        titularUser = tramite.solicitante;
      }
      titularNombre = titularUser?.full_name || tramite.solicitante?.full_name || tramite.firma_solicitante_nombre || 'Solicitante';
    }
  }

  // Resolver asistente
  let asistenteUser = null;
  let asistenteNombre = null;
  if (tramite) {
    const asisId = tramite.asistente_id || tramite.asistente?.id;
    if (asisId && usersMap[asisId]) {
      asistenteUser = usersMap[asisId];
    } else if (tramite.asistente) {
      asistenteUser = tramite.asistente;
    }
    if (asistenteUser) {
      asistenteNombre = asistenteUser.full_name || asistenteUser.username;
    } else if (tramite.asistente_id) {
      asistenteNombre = `Usuario #${tramite.asistente_id}`;
    }
  }

  const titularTelegramId = titularUser?.telegram_id || tramite?.solicitante?.telegram_id || tramite?.personal?.system_user?.telegram_id;
  const titularHasTelegram = Boolean(titularTelegramId);

  const asistenteTelegramId = asistenteUser?.telegram_id || tramite?.asistente?.telegram_id;
  const asistenteHasTelegram = Boolean(asistenteTelegramId);

  const saldoPendiente = tramite
    ? Math.max(0, (tramite.monto_solicitado || 0) - (tramite.monto_comprobado || 0) - (tramite.monto_devuelto || 0))
    : 0;

  // Plantillas predeterminadas
  const templates = {
    comprobacion: `Estimado(a) ${titularNombre},\n\nLe recordamos amablemente iniciar la carga de sus facturas (XML + PDF) en el bot de Telegram o en la plataforma SIAE para comprobar este trámite.\n\n• Saldo pendiente por comprobar: $${saldoPendiente.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN.`,
    factura_error: `Estimado(a) ${titularNombre},\n\nLe informamos que una o más facturas cargadas en su trámite Folio ${folio} presentan inconsistencias fiscales o no cumplen con los requisitos institucionales (RFC de CICESE, método PUE, o concepto de gasto no autorizado).\n\nPor favor ingrese al sistema o al bot de Telegram para sustituir los comprobantes correspondientes a la brevedad.`,
    devolucion: `Estimado(a) ${titularNombre},\n\nSe detectó un remanente no ejercido de $${saldoPendiente.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN en este trámite Folio ${folio}.\n\nLe recordamos realizar el depósito de reintegro a la cuenta institucional de CICESE y adjuntar la ficha de depósito para proceder con el finiquito de su expediente.`,
    urgente: `⚠️ AVISO URGENTE: El plazo reglamentario de 10 días para la comprobación de su trámite Folio ${folio} se encuentra próximo a vencer o vencido.\n\n• Saldo pendiente: $${saldoPendiente.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN.\n\nPor favor proceda a regularizar su expediente a la brevedad posible para evitar observaciones y bloqueos administrativos.`,
    finiquito: `🎉 Estimado(a) ${titularNombre},\n\nLe informamos que la comprobación de su trámite Folio ${folio} ha sido revisada y validada satisfactoriamente al 100%.\n\nSu expediente financiero queda formalmente finiquitado y cerrado. ¡Muchas gracias por su puntual gestión!`,
    personalizado: ''
  };

  useEffect(() => {
    if (open && tramite) {
      form.setFieldsValue({
        template: 'comprobacion',
        message: templates.comprobacion
      });
      setSendTitular(true);
      setSendAsistente(Boolean(asistenteNombre));
    }
  }, [open, tramite, titularNombre, saldoPendiente]);

  const handleTemplateChange = (val) => {
    form.setFieldsValue({
      message: templates[val] || ''
    });
  };

  const handleSend = async () => {
    try {
      const values = await form.validateFields();
      if (!sendTitular && !sendAsistente) {
        message.warning('Debes seleccionar al menos un destinatario (Titular o Asistente).');
        return;
      }

      setSending(true);
      const payload = {
        tramite_type: tramiteType,
        tramite_id: tramite.id,
        message: values.message,
        send_to_titular: sendTitular,
        send_to_asistente: sendAsistente
      };

      const response = await apiClient.post('/notifications/announcement', payload);
      
      if (response.data?.status === 'processed') {
        const count = response.data.results?.length || 0;
        message.success(`Aviso enviado con éxito a través de Telegram (${count} destinatario${count !== 1 ? 's' : ''}).`);
        form.resetFields();
        onClose();
      } else {
        message.warning('El aviso se procesó pero no se encontraron usuarios con Telegram vinculado.');
      }
    } catch (err) {
      console.error('Error enviando anuncio:', err);
      message.error(err.response?.data?.detail || 'Error al enviar el aviso por Telegram.');
    } finally {
      setSending(false);
    }
  };

  if (!tramite) return null;

  return (
    <Modal
      title={
        <Space>
          <RobotOutlined style={{ color: '#0088cc', fontSize: 20 }} />
          <span>Enviar Aviso / Recordatorio vía Telegram Bot</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={620}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancelar
        </Button>,
        <Button
          key="send"
          type="primary"
          icon={<SendOutlined />}
          loading={sending}
          onClick={handleSend}
          style={{ background: '#0088cc', borderColor: '#0088cc' }}
        >
          Enviar Aviso a Telegram
        </Button>
      ]}
    >
      <Card
        size="small"
        style={{
          background: '#f0f9ff',
          borderColor: '#bae6fd',
          borderRadius: 8,
          marginBottom: 16
        }}
      >
        <Space direction="vertical" size={2} style={{ width: '100%' }}>
          <Text strong style={{ color: '#0369a1' }}>
            📋 {isViatico ? 'Viático (Comisión)' : 'GRC (Compras)'}: Folio {folio}
          </Text>
          <div style={{ fontSize: 13, color: '#475569' }}>
            • <b>Monto Asignado:</b> ${(tramite.monto_solicitado || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN | 
            • <b>Pendiente:</b> ${(saldoPendiente).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
          </div>
        </Space>
      </Card>

      <Spin spinning={loadingUsers}>
        <Form form={form} layout="vertical">
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            👥 Destinatarios de la Notificación:
          </Text>

          <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 8, marginBottom: 16, border: '1px solid #e2e8f0' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Checkbox
                checked={sendTitular}
                onChange={(e) => setSendTitular(e.target.checked)}
              >
                <Space wrap>
                  <UserOutlined />
                  <Text strong>{isViatico ? 'Comisionado:' : 'Solicitante:'}</Text>
                  <span>{titularNombre}</span>
                  {titularHasTelegram ? (
                    <Tag color="success" icon={<CheckCircleOutlined />}>
                      Telegram Conectado ({titularTelegramId})
                    </Tag>
                  ) : (
                    <Tag color="default">Sin vincular</Tag>
                  )}
                </Space>
              </Checkbox>

              <Divider style={{ margin: '6px 0' }} />

              <Checkbox
                checked={sendAsistente}
                disabled={!asistenteNombre}
                onChange={(e) => setSendAsistente(e.target.checked)}
              >
                <Space wrap>
                  <TeamOutlined />
                  <Text strong>Asistente asignado:</Text>
                  <span>{asistenteNombre || 'Sin asistente'}</span>
                  {asistenteNombre && (asistenteHasTelegram ? (
                    <Tag color="success" icon={<CheckCircleOutlined />}>
                      Telegram Conectado ({asistenteTelegramId})
                    </Tag>
                  ) : (
                    <Tag color="default">Sin vincular</Tag>
                  ))}
                </Space>
              </Checkbox>
            </Space>
          </div>

          <Form.Item name="template" label="Plantilla de Mensaje">
            <Select onChange={handleTemplateChange}>
              <Option value="comprobacion">📌 Recordatorio de Comprobación y Carga de Facturas</Option>
              <Option value="factura_error">🧾 Factura con Error / Solicitud de Sustitución SAT</Option>
              <Option value="devolucion">💳 Recordatorio de Reintegro de Remanente</Option>
              <Option value="urgente">🔴 Alerta Urgente / Plazo Vencido de Comprobación</Option>
              <Option value="finiquito">🎯 Finiquito y Cierre de Expediente Validado</Option>
              <Option value="personalizado">✍️ Mensaje Personalizado / Libre</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="message"
            label="Cuerpo del Mensaje (Se enviará vía @DEO_facturabot)"
            rules={[{ required: true, message: 'Por favor escribe el mensaje a enviar' }]}
          >
            <TextArea rows={5} placeholder="Escribe el mensaje o aviso aquí..." />
          </Form.Item>

          <Alert
            message="Los usuarios con Telegram conectado recibirán este aviso al instante en su chat privado con el Bot de SIAE."
            type="info"
            showIcon
            style={{ fontSize: 12 }}
          />
        </Form>
      </Spin>
    </Modal>
  );
}
