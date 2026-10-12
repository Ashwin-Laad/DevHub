import { gql } from '@apollo/client';

export const CURRENT_USER = gql`
  query CurrentUser {
    currentUser { id name email }
  }
`;

export const REGISTER = gql`
  mutation Register($input: RegisterInput!) {
    register(input: $input) { id name email }
  }
`;

export const LOGIN = gql`
  mutation Login($input: LoginInput!) {
    login(input: $input) { token user { id name email } }
  }
`;

export const MY_ORGANIZATIONS = gql`
  query MyOrganizations {
    myOrganizations { id name createdAt }
  }
`;

export const ORGANIZATION_DETAILS = gql`
  query OrganizationDetails($id: ID!) {
    organization(id: $id) {
      id name
      members {
        id
        role
        user { id name email }
      }
    }
  }
`;

export const ADD_ORGANIZATION_MEMBER = gql`
  mutation AddOrganizationMember($input: AddOrganizationMemberInput!) {
    addOrganizationMember(input: $input) {
      id
      role
      user { id name email }
      organization { id }
    }
  }
`;

export const CREATE_ORGANIZATION = gql`
  mutation CreateOrganization($input: CreateOrganizationInput!) {
    createOrganization(input: $input) { id name createdAt }
  }
`;

export const MY_PROJECTS = gql`
  query MyProjects {
    myProjects { id name description status organization { id name } createdAt }
  }
`;

export const ORGANIZATION_PROJECTS = gql`
  query OrganizationProjects($organizationId: ID!) {
    projects(organizationId: $organizationId) {
      id name description status createdAt
    }
  }
`;

export const CREATE_PROJECT = gql`
  mutation CreateProject($input: CreateProjectInput!) {
    createProject(input: $input) { id name description status createdAt }
  }
`;

export const PROJECT_DETAILS = gql`
  query ProjectDetails($id: ID!) {
    project(id: $id) {
      id name description status createdAt
      organization {
        id name
        members { role user { id name email } }
      }
      createdBy { id name email }
    }
  }
`;

export const PROJECT_ISSUES = gql`
  query ProjectIssues($projectId: ID!, $filter: IssueFilterInput, $limit: Int, $offset: Int) {
    issues(projectId: $projectId, filter: $filter, limit: $limit, offset: $offset) {
      id title description status priority createdAt updatedAt
      creator { id name }
      assignee { id name email }
      labels { id name }
    }
  }
`;

export const PROJECT_LABELS = gql`
  query ProjectLabels($projectId: ID!) {
    labels(projectId: $projectId) { id name }
  }
`;

export const PROJECT_ACTIVITY = gql`
  query ProjectActivity($projectId: ID!, $limit: Int, $offset: Int) {
    projectActivity(projectId: $projectId, limit: $limit, offset: $offset) {
      id type createdAt actor { id name } issue { id title }
    }
  }
`;

export const CREATE_ISSUE = gql`
  mutation CreateIssue($input: CreateIssueInput!) {
    createIssue(input: $input) {
      id title description status priority createdAt
      creator { id name }
      assignee { id name email }
      labels { id name }
    }
  }
`;

export const UPDATE_ISSUE = gql`
  mutation UpdateIssue($input: UpdateIssueInput!) {
    updateIssue(input: $input) { id title description status priority updatedAt }
  }
`;

export const ASSIGN_ISSUE = gql`
  mutation AssignIssue($input: AssignIssueInput!) {
    assignIssue(input: $input) { id assignee { id name email } }
  }
`;

export const ISSUE_DETAILS = gql`
  query IssueDetails($id: ID!) {
    issue(id: $id) {
      id title description status priority createdAt updatedAt
      creator { id name }
      assignee { id name email }
      comments { id content createdAt author { id name } }
      labels { id name }
      activity { id type createdAt actor { id name } }
    }
  }
`;

export const CREATE_COMMENT = gql`
  mutation CreateComment($input: CreateCommentInput!) {
    createComment(input: $input) { id content createdAt author { id name } }
  }
`;

export const CREATE_LABEL = gql`
  mutation CreateLabel($input: CreateLabelInput!) {
    createLabel(input: $input) { id name }
  }
`;

export const ATTACH_LABEL = gql`
  mutation AttachLabel($issueId: ID!, $labelId: ID!) {
    attachLabelToIssue(issueId: $issueId, labelId: $labelId) { id labels { id name } }
  }
`;

export const REMOVE_LABEL = gql`
  mutation RemoveLabel($issueId: ID!, $labelId: ID!) {
    removeLabelFromIssue(issueId: $issueId, labelId: $labelId) { id labels { id name } }
  }
`;

export const MY_NOTIFICATIONS = gql`
  query MyNotifications($limit: Int, $offset: Int) {
    myNotifications(limit: $limit, offset: $offset) {
      id type message read createdAt relatedIssue { id title }
    }
  }
`;

export const MARK_NOTIFICATION_READ = gql`
  mutation MarkNotificationRead($id: ID!) {
    markNotificationRead(id: $id) { id read }
  }
`;

export const MARK_ALL_NOTIFICATIONS_READ = gql`
  mutation MarkAllNotificationsRead {
    markAllNotificationsRead
  }
`;
