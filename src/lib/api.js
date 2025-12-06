const API_BASE_URL='https://questera-hackthon-2399.vercel.app/api';

const getAuthToken=()=> localStorage.getItem('authToken');

const headers=()=> ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${getAuthToken()}`
});

export const imageAPI={
  // Generate Image
  generate: async (payload)=> {
    const response=await fetch(`${API_BASE_URL}/image/generate`,{
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });
    return response.json();
  },

  // Get Conversation History
  getConversation: async (imageChatId)=> {
    const response=await fetch(`${API_BASE_URL}/image/conversation/${imageChatId}`,{
      method: 'GET',
      headers: headers(),
    });
    return response.json();
  },

  // Get User Conversations
  getUserConversations: async (userId)=> {
    const response=await fetch(`${API_BASE_URL}/image/user/${userId}/conversations`,{
      method: 'GET',
      headers: headers(),
    });
    return response.json();
  },

  // Get Project Settings
  getProjectSettings: async (imageChatId)=> {
    const response=await fetch(`${API_BASE_URL}/image/project-settings/${imageChatId}`,{
      method: 'GET',
      headers: headers(),
    });
    return response.json();
  },

  // Update Project Settings
  updateProjectSettings: async (imageChatId,settings)=> {
    const response=await fetch(`${API_BASE_URL}/image/project-settings/${imageChatId}`,{
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(settings),
    });
    return response.json();
  }
};