import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { ArrowDown, ArrowUpRight, FolderKanban, Plus, Search, Building2, UserPlus, X } from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  ADD_ORGANIZATION_MEMBER,
  CREATE_ORGANIZATION,
  CREATE_PROJECT,
  MY_ORGANIZATIONS,
  ORGANIZATION_DETAILS,
  ORGANIZATION_PROJECTS,
} from '../graphql/operations.js';
import { EmptyState, ErrorMessage, LoadingState } from '../components/Feedback.jsx';

export default function WorkspacePage() {
  const { user } = useOutletContext();
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [organizationFormOpen, setOrganizationFormOpen] = useState(false);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [memberFormOpen, setMemberFormOpen] = useState(false);
  const [organizationName, setOrganizationName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState('DEVELOPER');
  const [memberSearch, setMemberSearch] = useState('');
  const [memberSuccessMessage, setMemberSuccessMessage] = useState('');
  const [search, setSearch] = useState('');

  const organizationsQuery = useQuery(MY_ORGANIZATIONS);
  const organizations = organizationsQuery.data?.myOrganizations ?? [];

  useEffect(() => {
    if (!selectedOrganizationId && organizations.length) {
      setSelectedOrganizationId(organizations[0].id);
    }
    if (selectedOrganizationId && !organizations.some((org) => org.id === selectedOrganizationId)) {
      setSelectedOrganizationId(organizations[0]?.id ?? '');
    }
  }, [organizations, selectedOrganizationId]);

  const organizationQuery = useQuery(ORGANIZATION_DETAILS, {
    variables: { id: selectedOrganizationId },
    skip: !selectedOrganizationId,
  });
  const projectsQuery = useQuery(ORGANIZATION_PROJECTS, {
    variables: { organizationId: selectedOrganizationId },
    skip: !selectedOrganizationId,
  });
  const [createOrganization, createOrganizationState] = useMutation(CREATE_ORGANIZATION, {
    refetchQueries: [{ query: MY_ORGANIZATIONS }],
    awaitRefetchQueries: true,
    onCompleted: (data) => {
      setSelectedOrganizationId(data.createOrganization.id);
      setOrganizationName('');
      setOrganizationFormOpen(false);
    },
  });
  const [createProject, createProjectState] = useMutation(CREATE_PROJECT, {
    refetchQueries: selectedOrganizationId
      ? [{ query: ORGANIZATION_PROJECTS, variables: { organizationId: selectedOrganizationId } }]
      : [],
    awaitRefetchQueries: true,
    onCompleted: () => {
      setProjectName('');
      setProjectDescription('');
      setProjectFormOpen(false);
    },
  });
  const [addOrganizationMember, addMemberState] = useMutation(ADD_ORGANIZATION_MEMBER, {
    refetchQueries: selectedOrganizationId
      ? [{ query: ORGANIZATION_DETAILS, variables: { id: selectedOrganizationId } }]
      : [],
    awaitRefetchQueries: true,
    onCompleted: (data) => {
      setMemberEmail('');
      setMemberRole('DEVELOPER');
      setMemberFormOpen(false);
      const addedUser = data?.addOrganizationMember?.user;
      setMemberSuccessMessage(
        `Added ${addedUser?.name || addedUser?.email || 'member'} as ${data?.addOrganizationMember?.role?.replace('_', ' ').toLowerCase()}.`,
      );
    },
  });

  useEffect(() => {
    setMemberSuccessMessage('');
    setMemberFormOpen(false);
    setMemberEmail('');
    setMemberSearch('');
  }, [selectedOrganizationId]);

  const organization = organizationQuery.data?.organization;
  const members = organization?.members ?? [];
  const currentMembership = members.find(({ user: memberUser }) => memberUser.id === user.id);
  const isAdmin = currentMembership?.role === 'ADMIN';
  const canCreateProjects = ['ADMIN', 'PROJECT_MANAGER'].includes(currentMembership?.role);
  const projects = projectsQuery.data?.projects ?? [];
  const filteredProjects = projects.filter((project) =>
    `${project.name} ${project.description ?? ''}`.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredMembers = members.filter((m) => {
    const term = memberSearch.toLowerCase();
    const nameMatch = m.user?.name?.toLowerCase().includes(term);
    const emailMatch = m.user?.email?.toLowerCase().includes(term);
    const roleMatch = m.role?.toLowerCase().includes(term);
    return nameMatch || emailMatch || roleMatch;
  });
  const combinedError =
    organizationsQuery.error ||
    organizationQuery.error ||
    projectsQuery.error ||
    createOrganizationState.error ||
    createProjectState.error ||
    addMemberState.error;

  async function submitOrganization(event) {
    event.preventDefault();
    await createOrganization({ variables: { input: { name: organizationName } } });
  }

  async function submitProject(event) {
    event.preventDefault();
    await createProject({
      variables: {
        input: {
          organizationId: selectedOrganizationId,
          name: projectName,
          ...(projectDescription.trim() ? { description: projectDescription } : {}),
        },
      },
    });
  }

  async function submitMember(event) {
    event.preventDefault();
    setMemberSuccessMessage('');
    await addOrganizationMember({
      variables: {
        input: {
          organizationId: selectedOrganizationId,
          email: memberEmail.trim(),
          role: memberRole,
        },
      },
    });
  }

  return (
    <div className="workspace-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">TEAM OPERATIONS <span className="eyebrow-rule" /></div>
          <h1>Your organizations</h1>
          <p className="page-subtitle">A clear view of the teams and projects you’re part of.</p>
        </div>
        <button className="button button-primary" type="button" onClick={() => setOrganizationFormOpen((open) => !open)}>
          {organizationFormOpen ? <X size={16} /> : <Plus size={17} />}
          {organizationFormOpen ? 'Close' : 'New organization'}
        </button>
      </div>

      <ErrorMessage error={combinedError} />

      {memberSuccessMessage && (
        <div className="success-message" role="status">
          {memberSuccessMessage}
        </div>
      )}

      {organizationFormOpen && (
        <form className="creation-strip" onSubmit={submitOrganization}>
          <div className="creation-icon"><Building2 size={19} /></div>
          <label className="grow-field">Organization name<input autoFocus required maxLength={100} value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="e.g. Northstar Studio" /></label>
          <button className="button button-primary" type="submit" disabled={createOrganizationState.loading}>{createOrganizationState.loading ? 'Creating…' : 'Create organization'}</button>
        </form>
      )}

      {organizationsQuery.loading ? <LoadingState label="Loading organizations" /> : organizations.length === 0 ? (
        <EmptyState title="Start with an organization" detail="Create an organization to bring your team and projects together." action={<button className="button button-primary" type="button" onClick={() => setOrganizationFormOpen(true)}><Plus size={16} /> Create organization</button>} />
      ) : (
        <>
          <div className="organization-toolbar">
            <div className="select-wrap">
              <Building2 size={16} />
              <select aria-label="Select organization" value={selectedOrganizationId} onChange={(event) => setSelectedOrganizationId(event.target.value)}>
                {organizations.map((org) => <option value={org.id} key={org.id}>{org.name}</option>)}
              </select>
              <ArrowDown size={14} />
            </div>
            <div className="toolbar-stats">
              <span className="toolbar-count">{projects.length} {projects.length === 1 ? 'project' : 'projects'}</span>
              <span className="meta-separator">·</span>
              <span className="toolbar-count">{members.length} {members.length === 1 ? 'member' : 'members'}</span>
            </div>
          </div>

          <div className="section-heading project-section-heading">
            <div><span className="eyebrow">ORGANIZATION PROJECTS</span><h2>{organization?.name || 'Projects'}</h2></div>
            <div className="section-actions">
              <label className="search-field"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a project" aria-label="Find a project" /></label>
              {canCreateProjects && <button className="button button-outline" type="button" onClick={() => setProjectFormOpen((open) => !open)}><Plus size={16} /> New project</button>}
            </div>
          </div>

          {projectFormOpen && (
            <form className="creation-strip project-creation" onSubmit={submitProject}>
              <div className="creation-icon project-icon"><FolderKanban size={19} /></div>
              <label className="grow-field">Project name<input autoFocus required maxLength={120} value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="e.g. Mobile app" /></label>
              <label className="grow-field description-field">Description <span>optional</span><input maxLength={5000} value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} placeholder="What is this project about?" /></label>
              <button className="button button-primary" type="submit" disabled={createProjectState.loading}>{createProjectState.loading ? 'Creating…' : 'Create project'}</button>
            </form>
          )}

          {projectsQuery.loading || organizationQuery.loading ? <LoadingState label="Loading projects" /> : filteredProjects.length ? (
            <div className="project-grid">
              {filteredProjects.map((project, index) => (
                <Link className="project-card" to={`/projects/${project.id}`} key={project.id}>
                  <div className={`project-card-mark mark-${index % 4}`}><FolderKanban size={19} /></div>
                  <div className="project-card-top"><span className={`status-pill status-${project.status.toLowerCase()}`}>{project.status}</span><ArrowUpRight size={17} /></div>
                  <h3>{project.name}</h3>
                  <p>{project.description || 'No description yet.'}</p>
                  <div className="project-card-foot"><span>{organization?.name}</span><span>OPEN PROJECT <ArrowUpRight size={12} /></span></div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title={search ? 'No matching projects' : 'No projects here yet'} detail={search ? 'Try a different project name.' : canCreateProjects ? 'Create the first project for this organization.' : 'An organization manager can create a project for your team.'} action={canCreateProjects && !search ? <button className="button button-outline" type="button" onClick={() => setProjectFormOpen(true)}><Plus size={16} /> Create project</button> : null} />
          )}

          <div className="section-heading member-section-heading">
            <div><span className="eyebrow">ORGANIZATION TEAM</span><h2>Team members <span className="heading-count">{members.length}</span></h2></div>
            <div className="section-actions">
              <label className="search-field"><Search size={15} /><input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Find a member" aria-label="Find a member" /></label>
              {isAdmin && (
                <button
                  className="button button-outline"
                  type="button"
                  onClick={() => {
                    setMemberFormOpen((open) => !open);
                    setMemberSuccessMessage('');
                  }}
                >
                  {memberFormOpen ? <X size={16} /> : <UserPlus size={16} />}
                  {memberFormOpen ? 'Close' : 'Add member'}
                </button>
              )}
            </div>
          </div>

          {memberFormOpen && isAdmin && (
            <form className="creation-strip member-creation" onSubmit={submitMember}>
              <div className="creation-icon member-icon"><UserPlus size={19} /></div>
              <label className="grow-field">
                Member email
                <input
                  type="email"
                  autoFocus
                  required
                  value={memberEmail}
                  onChange={(event) => setMemberEmail(event.target.value)}
                  placeholder="colleague@example.com"
                />
              </label>
              <label className="grow-field role-field">
                Role
                <select
                  value={memberRole}
                  onChange={(event) => setMemberRole(event.target.value)}
                >
                  <option value="DEVELOPER">Developer</option>
                  <option value="PROJECT_MANAGER">Project Manager</option>
                </select>
              </label>
              <button className="button button-primary" type="submit" disabled={addMemberState.loading}>
                {addMemberState.loading ? 'Adding…' : 'Add member'}
              </button>
            </form>
          )}

          {organizationQuery.loading ? (
            <LoadingState label="Loading team members" />
          ) : filteredMembers.length ? (
            <div className="member-grid">
              {filteredMembers.map((m) => {
                const isCurrentUser = m.user?.id === user.id;
                return (
                  <div className="member-card" key={m.id || m.user?.id}>
                    <div className="member-avatar">
                      {m.user?.name ? m.user.name.slice(0, 1).toUpperCase() : 'U'}
                    </div>
                    <div className="member-card-body">
                      <div className="member-name-row">
                        <strong>
                          {m.user?.name || 'Unknown User'} {isCurrentUser && <span className="current-user-tag">(You)</span>}
                        </strong>
                        <span className={`role-badge role-${m.role?.toLowerCase()}`}>
                          {m.role === 'PROJECT_MANAGER'
                            ? 'Project Manager'
                            : m.role === 'ADMIN'
                            ? 'Admin'
                            : 'Developer'}
                        </span>
                      </div>
                      <span className="member-email">{m.user?.email}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title={memberSearch ? 'No matching members' : 'No team members'}
              detail={
                memberSearch
                  ? 'Try a different search term.'
                  : isAdmin
                  ? 'Add colleagues to your organization to collaborate on projects.'
                  : 'Your organization administrator can add team members.'
              }
              action={
                isAdmin && !memberSearch ? (
                  <button
                    className="button button-outline"
                    type="button"
                    onClick={() => setMemberFormOpen(true)}
                  >
                    <UserPlus size={16} /> Add member
                  </button>
                ) : null
              }
            />
          )}
        </>
      )}
    </div>
  );
}
