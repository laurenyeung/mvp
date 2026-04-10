import axios from 'axios'
import { useAuthStore } from '@/features/auth/store/authStore'

export const api = axios.create({
  baseURL:         import.meta.env.VITE_API_URL ?? '/api/v1',
  headers:         { 'Content-Type': 'application/json' },
  withCredentials: true, // send the httpOnly JWT cookie on every request
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isAuthEndpoint = err.config?.url?.includes('/auth/')
    if (err.response?.status === 401 && !isAuthEndpoint) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const authApi = {
  register: (body) => api.post('/auth/register', body),
  login:    (body) => api.post('/auth/login', body),
  me:       ()     => api.get('/auth/me'),
  logout:   ()     => api.post('/auth/logout'),
}

export const exercisesApi = {
  list:   (params)       => api.get('/exercises', { params }),
  get:    (id)           => api.get(`/exercises/${id}`),
  create: (body)         => api.post('/exercises', body),
  update: (id, body)     => api.patch(`/exercises/${id}`, body),
  delete: (id)           => api.delete(`/exercises/${id}`),
}

export const coachApi = {
  // Templates
  listTemplates:   ()          => api.get('/coach/templates'),
  getTemplate:     (id)        => api.get(`/coach/templates/${id}`),
  createTemplate:  (body)      => api.post('/coach/templates', body),
  updateTemplate:  (id, body)  => api.put(`/coach/templates/${id}`, body),
  deleteTemplate:  (id)        => api.delete(`/coach/templates/${id}`),

  // Clients
  listClients:       ()        => api.get('/coach/clients'),
  searchClients:     (q)       => api.get('/coach/clients/search', { params: { q } }),
  addClient:         (userId)  => api.post('/coach/clients', { user_id: userId }),
  getClient:         (id)      => api.get(`/coach/clients/${id}`),
  getClientWorkouts: (clientId, params) =>
    api.get(`/coach/clients/${clientId}/workouts`, { params }),

  // Workouts
  assignWorkout:  (body)      => api.post('/coach/workouts/assign', body),
  getWorkout:     (id)        => api.get(`/coach/workouts/${id}`),
  updateWorkout:  (id, body)  => api.patch(`/coach/workouts/${id}`, body),
  deleteWorkout:  (id)        => api.delete(`/coach/workouts/${id}`),
  respondRescheduleRequest: (workoutId, reqId, body) =>
    api.post(`/coach/workouts/${workoutId}/reschedule-requests/${reqId}/respond`, body),

  // Workout exercise prescriptions
  updateWorkoutExercise: (id, body) => api.patch(`/coach/workout-exercises/${id}`, body),

  // Comments
  getWorkoutComments:  (workoutId)         => api.get(`/coach/workouts/${workoutId}/comments`),
  addWorkoutComment:   (workoutId, body)   => api.post(`/coach/workouts/${workoutId}/comments`, body),
}

function localDateStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const clientApi = {
  todayWorkout:    ()       => api.get('/client/workouts/today',    { params: { date: localDateStr() } }),
  upcomingWorkouts:()       => api.get('/client/workouts/upcoming', { params: { date: localDateStr() } }),
  pastWorkouts:    ()       => api.get('/client/workouts/past',     { params: { date: localDateStr() } }),
  listWorkouts:    (params) => api.get('/client/workouts', { params }),
  getWorkout:      (id)     => api.get(`/client/workouts/${id}`),
  logWorkout:           (workoutId, body) => api.post(`/client/workouts/${workoutId}/log`, body),
  requestReschedule:    (workoutId, body) => api.post(`/client/workouts/${workoutId}/request-reschedule`, body),

  // Media
  uploadExerciseMedia: (exerciseLogId, body) =>
    api.post(`/client/exercise-logs/${exerciseLogId}/media`, body),

  // Comments
  getWorkoutComments:    (workoutId)       => api.get(`/client/workouts/${workoutId}/comments`),
  addWorkoutComment:     (workoutId, body) => api.post(`/client/workouts/${workoutId}/comments`, body),
  addExerciseComment:    (exerciseLogId, body) =>
    api.post(`/client/exercise-logs/${exerciseLogId}/comments`, body),

  // Progress
  getProgress:  (params) => api.get('/client/progress', { params }),
  addProgress:  (body)   => api.post('/client/progress', body),
}

export const messagesApi = {
  listThreads: ()            => api.get('/messages/threads'),
  getThread:   (id, params) => api.get(`/messages/threads/${id}`, { params }),
  send:        (body)        => api.post('/messages/send', body),
}

export const mediaApi = {
  presign:      (body) => api.post('/media/presign', body),
  getSignedUrl: (key)  => api.get(`/media/${encodeURIComponent(key)}/signed-url`),
}
