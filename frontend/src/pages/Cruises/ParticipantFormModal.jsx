/**
 * SIAE — Modal para asignar un participante del catálogo a un crucero.
 *
 * Busca en el catálogo de ParticipantProfile y asigna la persona
 * al crucero con su rol específico. Si la persona no existe en el
 * catálogo, ofrece el flujo de "Crear perfil nuevo".
 */
import { useState, useEffect } from 'react';
import {
  Modal, Form, Select, Switch, Typography, Space, Avatar,
  Tag, Divider, Button, Alert, message, Input,
} from 'antd';
import { TeamOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';

const { Text } = Typography;
const { TextArea } = Input;

const ROLE_OPTIONS = [
  { value: 'investigador_principal', label: '🔬 Investigador Principal' },
  { value: 'coinvestigador',         label: '🔬 Co-investigador' },
  { value: 'tecnico',                label: '🔧 Técnico' },
  { value: 'estudiante',             label: '🎓 Estudiante' },
  { value: 'capitan',                label: '⚓ Capitán' },
  { value: 'primer_oficial',         label: '⚓ Primer Oficial' },
  { value: 'marinero',               label: '⚓ Marinero' },
  { value: 'jefe_maquinas',          label: '⚙️ Jefe de Máquinas' },
  { value: 'medico',                 label: '🩺 Médico' },
  { value: 'otro',                   label: '👤 Otro' },
];

const ROLE_GROUPS = {
  investigador_principal: 'ciencia',
  coinvestigador:         'ciencia',
  tecnico:                'ciencia',
  estudiante:             'ciencia',
  capitan:                'tripulacion',
  primer_oficial:         'tripulacion',
  marinero:               'tripulacion',
  jefe_maquinas:          'tripulacion',
  medico:                 'tripulacion',
  otro:                   'ciencia',
};

function CruiseParticipantFormModal({
  open,
  onClose,
  onSaved,
  cruiseId,
  assignment,
  roleGroup = 'all',
  maxCrew,
  maxPassengers,
  currentCrewCount = 0,
  currentPassengersCount = 0,
}) {
  const [form] = Form.useForm();
  const [saving, setSaving]               = useState(false);
  const [options, setOptions]             = useState([]);
  const [loading, setLoading]             = useState(false);
  const [selectedProfile, setSelected]    = useState(null);

  const isEditing = !!assignment;

  const isCrew = roleGroup === 'tripulacion';
  const hasCrewLimit = typeof maxCrew === 'number';
  const hasPassengersLimit = typeof maxPassengers === 'number';

  const limitVal = isCrew ? maxCrew : maxPassengers;
  const currentCount = isCrew ? currentCrewCount : currentPassengersCount;
  const hasLimit = isCrew ? hasCrewLimit : hasPassengersLimit;

  const isOverCapacity = !isEditing && hasLimit && currentCount >= limitVal;
  const spotsLeft = hasLimit ? Math.max(0, limitVal - currentCount) : null;

  const filteredRoleOptions = ROLE_OPTIONS.filter(opt => {
    if (roleGroup === 'all') return true;
    return ROLE_GROUPS[opt.value] === roleGroup;
  });

  // Cargar opciones del catálogo o Personal DEO
  const fetchOptions = async (search = '') => {
    setLoading(true);
    try {
      if (roleGroup === 'tripulacion') {
        const r = await apiClient.get('/personnel', { params: { search, limit: 100 } });
        const mapped = (r.data.items || []).map(p => ({
          id: p.id,
          full_name: p.full_name,
          institution: 'Personal DEO',
          is_cicese_staff: true,
          photo_url: p.photo_url,
          personnel_record: p,
        }));
        setOptions(mapped);
      } else {
        const r = await apiClient.get('/participants/options', { params: { search } });
        setOptions(r.data);
      }
    } catch { /* */ }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open) fetchOptions(); }, [open, roleGroup]);

  useEffect(() => {
    if (!open) return;
    if (assignment) {
      if (roleGroup === 'tripulacion') {
        form.setFieldsValue({
          participant_id:            assignment.personnel_id,
          role_in_cruise:            assignment.role,
          notes:                     assignment.notes,
        });
        setSelected(assignment.personnel || null);
      } else {
        form.setFieldsValue({
          participant_id:            assignment.participant_id,
          role_in_cruise:            assignment.role_in_cruise,
          is_principal_investigator: assignment.is_principal_investigator,
          is_cruise_leader:          assignment.is_cruise_leader,
          notes:                     assignment.notes,
        });
        setSelected(assignment.participant || null);
      }
    } else {
      form.resetFields();
      const defaultRole = roleGroup === 'tripulacion' ? 'capitan' : 'investigador_principal';
      form.setFieldsValue({ role_in_cruise: defaultRole, is_principal_investigator: false, is_cruise_leader: false });
      setSelected(null);
    }
  }, [open, assignment, form, roleGroup]);

  const handleProfileSelect = (id) => {
    const profile = options.find(o => o.id === id);
    setSelected(profile || null);

    if (roleGroup === 'tripulacion' && profile?.personnel_record) {
      const pRole = profile.personnel_record.role;
      const validRoles = ['capitan', 'primer_oficial', 'jefe_maquinas', 'marinero', 'medico'];
      if (validRoles.includes(pRole)) {
        form.setFieldsValue({ role_in_cruise: pRole });
      } else {
        form.setFieldsValue({ role_in_cruise: 'otro' });
      }
    }
  };

  const handleSave = async () => {
    if (isOverCapacity) {
      message.error(isCrew ? 'No se pueden agregar más tripulantes. Capacidad excedida.' : 'No se pueden agregar más científicos. Capacidad excedida.');
      return;
    }
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (isEditing) {
        if (roleGroup === 'tripulacion') {
          await apiClient.put(`/cruises/${cruiseId}/crew/${assignment.id}`, {
            role:  values.role_in_cruise,
            notes: values.notes,
          });
        } else {
          await apiClient.put(`/cruises/${cruiseId}/participants/${assignment.id}`, {
            role_in_cruise:            values.role_in_cruise,
            is_principal_investigator: values.is_principal_investigator,
            is_cruise_leader:          values.is_cruise_leader,
            notes:                     values.notes,
          });
        }
      } else {
        if (roleGroup === 'tripulacion') {
          await apiClient.post(`/cruises/${cruiseId}/crew`, {
            personnel_id: values.participant_id,
            role:         values.role_in_cruise,
            notes:        values.notes,
          });
        } else {
          await apiClient.post(`/cruises/${cruiseId}/participants`, {
            participant_id:            values.participant_id,
            role_in_cruise:            values.role_in_cruise,
            is_principal_investigator: values.is_principal_investigator,
            is_cruise_leader:          values.is_cruise_leader,
            notes:                     values.notes,
          });
        }
      }
      onSaved();
      onClose();
    } catch (err) {
      if (err.response?.data?.detail) message.error(err.response.data.detail);
    } finally { setSaving(false); }
  };

  return (
    <Modal
      title={<Space><TeamOutlined style={{ color: '#0A2647' }} />{isEditing ? 'Editar participación' : 'Asignar participante'}</Space>}
      open={open} onCancel={onClose} onOk={handleSave}
      confirmLoading={saving}
      okText={isEditing ? 'Guardar cambios' : 'Asignar'}
      okButtonProps={{ disabled: isOverCapacity }}
      width={520} destroyOnClose
    >
      {hasLimit && (
        <Alert
          message={
            isOverCapacity 
              ? `Capacidad máxima alcanzada (${limitVal} ${isCrew ? 'tripulantes' : 'participantes'})`
              : `Capacidad de la embarcación: ${currentCount} de ${limitVal} asignados (${spotsLeft} disponible${spotsLeft !== 1 ? 's' : ''})`
          }
          type={isOverCapacity ? "error" : spotsLeft <= 1 ? "warning" : "info"}
          showIcon
          style={{ marginBottom: 12, marginTop: 8 }}
        />
      )}
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
        {/* Selector del catálogo (solo al crear) */}
        {!isEditing && (
          <>
            <Form.Item
              name="participant_id"
              label={roleGroup === 'tripulacion' ? "Seleccionar integrante del Personal DEO" : "Buscar en el catálogo de participantes"}
              rules={[{ required: true, message: roleGroup === 'tripulacion' ? 'Selecciona un miembro del personal' : 'Selecciona un participante del catálogo' }]}
              extra={
                roleGroup === 'tripulacion' ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Muestra los empleados de la tripulación y personal registrado en la sección de Personal DEO.
                  </Text>
                ) : (
                  <Space style={{ marginTop: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      ¿No está en el catálogo?
                    </Text>
                    <Button type="link" size="small" icon={<PlusOutlined />}
                      href="/participants" target="_blank" style={{ padding: 0 }}>
                      Registrar participante nuevo
                    </Button>
                  </Space>
                )
              }
            >
              <Select
                showSearch
                loading={loading}
                placeholder="Buscar por nombre o institución..."
                filterOption={false}
                onSearch={fetchOptions}
                onChange={handleProfileSelect}
                optionLabelProp="label"
                options={options.map(p => ({
                  value: p.id,
                  label: p.full_name,
                  data:  p,
                }))}
                optionRender={(opt) => (
                  <Space>
                    <Avatar size={28}
                      src={opt.data?.data?.photo_url ? opt.data.data.photo_url : null}
                      icon={<UserOutlined />}
                      style={{ background: opt.data?.data?.is_cicese_staff ? '#0A2647' : '#6b7280' }}
                    />
                    <div>
                      <div style={{ fontWeight: 600 }}>{opt.data?.data?.full_name}</div>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {opt.data?.data?.is_cicese_staff ? '🏛️ CICESE' : '🌍'} {opt.data?.data?.institution}
                      </Text>
                    </div>
                  </Space>
                )}
              />
            </Form.Item>

            {/* Preview del perfil seleccionado */}
            {selectedProfile && (
              <Alert type="info" showIcon={false} style={{ marginBottom: 16, padding: '8px 12px' }}
                message={
                  <Space>
                    <Avatar size={32}
                      src={selectedProfile.photo_url ? selectedProfile.photo_url : null}
                      icon={<UserOutlined />}
                      style={{ background: selectedProfile.is_cicese_staff ? '#0A2647' : '#6b7280' }}
                    />
                    <div>
                      <Text strong>{selectedProfile.full_name}</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {selectedProfile.is_cicese_staff ? '🏛️ CICESE' : '🌍 Externo'} — {selectedProfile.institution}
                      </Text>
                    </div>
                  </Space>
                }
              />
            )}
          </>
        )}

        {/* Si estamos editando, mostrar info del participante */}
        {isEditing && (
          <Alert type="info" showIcon={false} style={{ marginBottom: 16, padding: '8px 12px' }}
            message={
              <Space>
                <Avatar size={32}
                  src={(roleGroup === 'tripulacion' ? assignment.personnel?.photo_url : assignment.participant?.photo_url) || null}
                  icon={<UserOutlined />} style={{ background: '#0A2647' }}
                />
                <Text strong>{roleGroup === 'tripulacion' ? assignment.personnel?.full_name : assignment.participant?.full_name}</Text>
              </Space>
            }
          />
        )}

        <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12 }}>🧭 Rol en este crucero</Divider>

        <Form.Item name="role_in_cruise" label="Función" rules={[{ required: true }]}>
          <Select options={filteredRoleOptions} />
        </Form.Item>

        {roleGroup !== 'tripulacion' && (
          <>
            <Form.Item name="is_principal_investigator" label="Investigador Principal" valuePropName="checked">
              <Switch checkedChildren="Sí" unCheckedChildren="No" />
            </Form.Item>
            <Form.Item name="is_cruise_leader" label="Jefe de Crucero (Responsable científico/técnico)" valuePropName="checked" extra="Solo puede haber un Jefe de Crucero designado por plan.">
              <Switch checkedChildren="Sí" unCheckedChildren="No" />
            </Form.Item>
          </>
        )}

        <Form.Item name="notes" label="Notas de esta participación">
          <TextArea rows={2} placeholder="Ej: Responsable de muestreo de CTDs" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default CruiseParticipantFormModal;
