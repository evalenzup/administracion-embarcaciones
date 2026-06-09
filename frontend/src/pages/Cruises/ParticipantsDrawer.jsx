/**
 * SIAE — Drawer de Participantes de un Crucero.
 *
 * Muestra los participantes asignados desde el catálogo,
 * agrupados en Tripulación e Investigadores/Técnicos.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Drawer, Button, Space, Typography, Avatar, Tag, Tooltip, Popconfirm,
  Empty, Divider, message, Row, Col, Card, Alert,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, TeamOutlined, StarFilled,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { CanAccess } from '../../components/common/CanAccess';
import { useAuth } from '../../context/AuthContext';
import CruiseParticipantFormModal from './ParticipantFormModal';

const { Title, Text } = Typography;

const ROLE_META = {
  investigador_principal: { label: 'Inv. Principal',  color: '#0A2647', group: 'ciencia'     },
  coinvestigador:         { label: 'Co-investigador', color: '#1B4F72', group: 'ciencia'     },
  tecnico:                { label: 'Técnico',          color: '#2C74B3', group: 'ciencia'     },
  estudiante:             { label: 'Estudiante',       color: '#52c41a', group: 'ciencia'     },
  capitan:                { label: 'Capitán',          color: '#7b2d00', group: 'tripulacion' },
  primer_oficial:         { label: '1er Oficial',      color: '#9c4221', group: 'tripulacion' },
  marinero:               { label: 'Marinero',         color: '#6b7280', group: 'tripulacion' },
  jefe_maquinas:          { label: 'Jefe Máquinas',    color: '#92400e', group: 'tripulacion' },
  medico:                 { label: 'Médico',           color: '#065f46', group: 'tripulacion' },
  otro:                   { label: 'Otro',             color: '#9ca3af', group: 'ciencia'     },
};

// ── Card de un participante asignado ──────────────────────────
function AssignmentCard({ assignment, onEdit, onRemove, readOnly, isCrew }) {
  const profile  = isCrew ? assignment.personnel : assignment.participant;
  const roleVal  = isCrew ? assignment.role : assignment.role_in_cruise;
  const roleMeta = ROLE_META[roleVal] || ROLE_META.otro;
  const photoSrc = profile?.photo_url ? profile.photo_url : null;

  const docExpiry  = !isCrew && profile?.id_document_expiry ? dayjs(profile.id_document_expiry) : null;
  const docExpired = docExpiry && docExpiry.isBefore(dayjs(), 'day');
  const docExpiring = docExpiry && !docExpired && docExpiry.diff(dayjs(), 'day') <= 60;

  return (
    <Card size="small" style={{
      marginBottom: 10, borderRadius: 10,
      border: !isCrew && assignment.is_cruise_leader
        ? '1.5px solid #FAAD14'
        : (!isCrew && assignment.is_principal_investigator ? '1.5px solid #0A2647' : '1px solid #e8e8e8'),
      background: !isCrew && assignment.is_cruise_leader
        ? '#FFFBE6'
        : (!isCrew && assignment.is_principal_investigator ? '#f0f5ff' : '#fff'),
    }}>
      <Row gutter={10} align="middle" wrap={false}>
        <Col flex="none">
          <Avatar size={48} src={photoSrc} icon={<UserOutlined />}
            style={{ background: roleMeta.color, flexShrink: 0 }} />
        </Col>
        <Col flex="auto" style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text strong style={{ fontSize: 13 }}>{profile?.full_name || '—'}</Text>
            {!isCrew && assignment.is_cruise_leader && (
              <Tooltip title="Jefe de Crucero">
                <span style={{ fontSize: 14 }}>👑</span>
              </Tooltip>
            )}
            {!isCrew && assignment.is_principal_investigator && (
              <Tooltip title="Investigador Principal">
                <StarFilled style={{ color: '#FAAD14', fontSize: 12 }} />
              </Tooltip>
            )}
          </div>
          <div style={{ marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {!isCrew && assignment.is_cruise_leader && (
              <Tag color="#FAAD14" style={{ margin: 0, fontSize: 10, fontWeight: 600 }}>JEFE DE CRUCERO</Tag>
            )}
            <Tag color={roleMeta.color} style={{ margin: 0, fontSize: 11 }}>{roleMeta.label}</Tag>
            <Text type="secondary" style={{ fontSize: 11 }}>
              🏛️ {isCrew ? 'CICESE (Personal DEO)' : (profile?.institution || '—')}
            </Text>
          </div>
          {/* Semáforo documento */}
          {!isCrew && profile?.id_document_number && (
            <div style={{ marginTop: 3, fontSize: 11,
              color: docExpired ? '#f5222d' : docExpiring ? '#faad14' : '#888' }}>
              🪪 {profile.id_document_number}
              {docExpiry && (
                <span style={{ marginLeft: 4 }}>
                  — {docExpired ? `⚠️ Vencido` : `Vence ${docExpiry.format('DD/MM/YYYY')}`}
                </span>
              )}
            </div>
          )}
          {assignment.notes && (
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
              📝 {assignment.notes}
            </Text>
          )}
        </Col>
        <Col flex="none">
          {!readOnly && (
            <Space direction="vertical" size={2}>
              <CanAccess module="cruises" action="edit">
                <Tooltip title="Editar rol">
                  <Button type="text" size="small" icon={<EditOutlined />} onClick={() => onEdit(assignment, isCrew)} />
                </Tooltip>
              </CanAccess>
              <CanAccess module="cruises" action="edit">
                <Popconfirm title="¿Quitar del crucero?" okText="Sí" cancelText="No"
                  onConfirm={() => onRemove(assignment.id, isCrew)}>
                  <Tooltip title="Quitar del crucero">
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Tooltip>
                </Popconfirm>
              </CanAccess>
            </Space>
          )}
        </Col>
      </Row>
    </Card>
  );
}

// ── Drawer principal ──────────────────────────────────────────
function ParticipantsDrawer({ cruise, open, onClose, inline = false }) {
  const { user } = useAuth();
  const [participants, setParticipants] = useState([]);
  const [crew, setCrew]                 = useState([]);
  const [loading, setLoading]           = useState(false);
  const [formOpen, setFormOpen]         = useState(false);
  const [editing, setEditing]           = useState(null);
  const [roleGroup, setRoleGroup]       = useState('all');

  const isAdmin = user?.is_superadmin || user?.roles?.some(r => r.name === 'Administrador');

  const fetchAssignments = useCallback(async () => {
    if (!cruise) return;
    setLoading(true);
    try {
      const [rParts, rCrew] = await Promise.all([
        apiClient.get(`/cruises/${cruise.id}/participants`),
        apiClient.get(`/cruises/${cruise.id}/crew`),
      ]);
      setParticipants(rParts.data);
      setCrew(rCrew.data);
    } catch {
      message.error('Error al cargar participantes y tripulación');
    } finally {
      setLoading(false);
    }
  }, [cruise]);

  useEffect(() => {
    if ((open || inline) && cruise) fetchAssignments();
    if (!open && !inline) {
      setParticipants([]);
      setCrew([]);
    }
  }, [open, inline, cruise, fetchAssignments]);

  const handleRemove = async (assignmentId, isCrew) => {
    try {
      const endpoint = isCrew
        ? `/cruises/${cruise.id}/crew/${assignmentId}`
        : `/cruises/${cruise.id}/participants/${assignmentId}`;
      await apiClient.delete(endpoint);
      message.success(isCrew ? 'Tripulante removido del crucero' : 'Participante removido del crucero');
      fetchAssignments();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Error al remover');
    }
  };

  const openCreateCrew = () => { setRoleGroup('tripulacion'); setEditing(null); setFormOpen(true); };
  const openCreateScience = () => { setRoleGroup('ciencia'); setEditing(null); setFormOpen(true); };

  const openEdit = (a, isCrew) => {
    setRoleGroup(isCrew ? 'tripulacion' : 'ciencia');
    setEditing(a);
    setFormOpen(true);
  };

  const maxCrew = cruise?.vessel?.max_crew;
  const maxPassengers = cruise?.vessel?.max_passengers;
  const crewOverLimit = typeof maxCrew === 'number' && crew.length > maxCrew;
  const passengersOverLimit = typeof maxPassengers === 'number' && participants.length > maxPassengers;
  const totalMax = (typeof maxCrew === 'number' && typeof maxPassengers === 'number')
    ? (maxCrew + maxPassengers)
    : null;

  const totalCount = participants.length + crew.length;

  const docsVencidos = participants.filter(a => {
    const exp = a.participant?.id_document_expiry;
    return exp && dayjs(exp).isBefore(dayjs(), 'day');
  }).length;

  const content = (
    <>
        {/* Resumen */}
        {!!cruise && (
          <div style={{ background: '#f0f5ff', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 20 }}>
            <div>
              <Text style={{ fontSize: 22, fontWeight: 700, color: '#0A2647' }}>
                {totalCount}
                {totalMax && <span style={{ fontSize: 14, fontWeight: 400, color: '#8c8c8c' }}> / {totalMax}</span>}
              </Text>
              <br /><Text type="secondary" style={{ fontSize: 11 }}>Total a Bordo</Text>
            </div>
            <div>
              <Text style={{ fontSize: 22, fontWeight: 700, color: crewOverLimit ? '#f5222d' : '#52c41a' }}>
                {crew.length}
                {typeof maxCrew === 'number' && <span style={{ fontSize: 14, fontWeight: 400, color: '#8c8c8c' }}> / {maxCrew}</span>}
              </Text>
              <br /><Text type="secondary" style={{ fontSize: 11 }}>Tripulación {crewOverLimit && <Tooltip title="Capacidad de tripulación excedida">⚠️</Tooltip>}</Text>
            </div>
            <div>
              <Text style={{ fontSize: 22, fontWeight: 700, color: passengersOverLimit ? '#f5222d' : '#1677ff' }}>
                {participants.length}
                {typeof maxPassengers === 'number' && <span style={{ fontSize: 14, fontWeight: 400, color: '#8c8c8c' }}> / {maxPassengers}</span>}
              </Text>
              <br /><Text type="secondary" style={{ fontSize: 11 }}>Científicos {passengersOverLimit && <Tooltip title="Capacidad de científicos/pasajeros excedida">⚠️</Tooltip>}</Text>
            </div>
            {docsVencidos > 0 && (
              <div>
                <Text style={{ fontSize: 22, fontWeight: 700, color: '#f5222d' }}>{docsVencidos}</Text>
                <br /><Text type="secondary" style={{ fontSize: 11 }}>Docs. vencidos</Text>
              </div>
            )}
          </div>
        )}

        {/* Alertas de capacidad excedida */}
        {crewOverLimit && (
          <Alert
            message="Capacidad de Tripulación Excedida"
            description={`La embarcación tiene una capacidad máxima de ${maxCrew} tripulantes. Actualmente hay ${crew.length} asignados.`}
            type="warning"
            showIcon
            style={{ marginBottom: 16, borderRadius: 8 }}
          />
        )}
        {passengersOverLimit && (
          <Alert
            message="Capacidad de Científicos Excedida"
            description={`La embarcación tiene una capacidad máxima de ${maxPassengers} científicos/pasajeros. Actualmente hay ${participants.length} asignados.`}
            type="warning"
            showIcon
            style={{ marginBottom: 16, borderRadius: 8 }}
          />
        )}

        {/* Banner para investigadores */}
        {!isAdmin && (
          <Alert
            message="La tripulación es gestionada exclusivamente por el DEO"
            description="Si requieres algún cambio en el personal de tripulación asignado, comunícate con el administrador."
            type="info"
            showIcon
            style={{ marginBottom: 16, borderRadius: 8 }}
          />
        )}

        {/* Tripulación */}
        {crew.length > 0 && (
          <>
            <Divider orientation="left" orientationMargin={0}
              style={{ fontSize: 12, color: '#7b2d00', borderColor: '#7b2d00', marginTop: 0 }}>
              ⚓ Tripulación ({crew.length}{typeof maxCrew === 'number' ? ` de ${maxCrew}` : ''})
            </Divider>
            {crew.map(a => (
              <AssignmentCard key={a.id} assignment={a} onEdit={openEdit} onRemove={handleRemove} readOnly={!isAdmin} isCrew={true} />
            ))}
          </>
        )}

        {/* Científicos */}
        {participants.length > 0 && (
          <>
            <Divider orientation="left" orientationMargin={0}
              style={{ fontSize: 12, color: '#0A2647', borderColor: '#0A2647' }}>
              🔬 Personal científico ({participants.length}{typeof maxPassengers === 'number' ? ` de ${maxPassengers}` : ''})
            </Divider>
            {participants.map(a => (
              <AssignmentCard key={a.id} assignment={a} onEdit={openEdit} onRemove={handleRemove} readOnly={false} isCrew={false} />
            ))}
          </>
        )}

        {/* Estado vacío */}
        {!loading && totalCount === 0 && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span>
                Sin participantes asignados.
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Usa "Asignar" para agregar personas del catálogo.
                </Text>
              </span>
            }
          >
            <CanAccess module="cruises" action="edit">
              {isAdmin ? (
                <Space>
                  <Button type="default" icon={<PlusOutlined />} onClick={openCreateCrew}>
                    Asignar Tripulante
                  </Button>
                  <Button type="primary" icon={<PlusOutlined />} onClick={openCreateScience}
                    style={{ background: '#0A2647' }}>
                    Asignar Científico
                  </Button>
                </Space>
              ) : (
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreateScience}
                  style={{ background: '#0A2647' }}>
                  Agregar Personal Científico
                </Button>
              )}
            </CanAccess>
          </Empty>
        )}
    </>
  );

  const actionButtons = (
    <CanAccess module="cruises" action="edit">
      {isAdmin ? (
        <Space>
          <Button type="default" icon={<PlusOutlined />} onClick={openCreateCrew}>
            Asignar Tripulante
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateScience}
            style={{ background: '#0A2647' }}>
            Asignar Científico
          </Button>
        </Space>
      ) : (
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateScience}
          style={{ background: '#0A2647' }}>
          Agregar Personal Científico
        </Button>
      )}
    </CanAccess>
  );

  if (inline) {
    return (
      <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, background: '#fff', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Space>
            <TeamOutlined style={{ color: '#0A2647' }} />
            <Text strong style={{ fontSize: 16 }}>Tripulación y Personal Científico a Bordo</Text>
          </Space>
          {actionButtons}
        </div>
        {content}
        <CruiseParticipantFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onSaved={() => { fetchAssignments(); setFormOpen(false); }}
          cruiseId={cruise?.id}
          assignment={editing}
          roleGroup={roleGroup}
          maxCrew={maxCrew}
          maxPassengers={maxPassengers}
          currentCrewCount={crew.length}
          currentPassengersCount={participants.length}
        />
      </div>
    );
  }

  return (
    <>
      <Drawer
        title={
          <Space>
            <TeamOutlined style={{ color: '#0A2647' }} />
            <span>
              Participantes —{' '}
              <Text type="secondary" style={{ fontWeight: 400 }}>{cruise?.name}</Text>
            </span>
          </Space>
        }
        open={open} onClose={onClose} width={520}
        extra={actionButtons}
      >
        {content}
      </Drawer>

      <CruiseParticipantFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => { fetchAssignments(); setFormOpen(false); }}
        cruiseId={cruise?.id}
        assignment={editing}
        roleGroup={roleGroup}
        maxCrew={maxCrew}
        maxPassengers={maxPassengers}
        currentCrewCount={crew.length}
        currentPassengersCount={participants.length}
      />
    </>
  );
}

export default ParticipantsDrawer;
