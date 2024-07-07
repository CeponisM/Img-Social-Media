import React, { useState } from 'react';
import './Comment.css';

function Comment({ comment, currentUser, onDelete, onReply }) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyText, setReplyText] = useState('');

  const handleReply = (e) => {
    e.preventDefault();
    onReply(replyText);
    setReplyText('');
    setShowReplyForm(false);
  };

  return (
    <div className="comment">
      <p><strong>{comment.username}</strong> {comment.text}</p>
      <div className="comment-actions">
        <button onClick={() => setShowReplyForm(!showReplyForm)}>Reply</button>
        {currentUser && currentUser.uid === comment.userId && (
          <button onClick={onDelete}>Delete</button>
        )}
      </div>
      {showReplyForm && (
        <form onSubmit={handleReply} className="reply-form">
          <input 
            type="text" 
            value={replyText} 
            onChange={(e) => setReplyText(e.target.value)} 
            placeholder="Write a reply..." 
          />
          <button type="submit">Post</button>
        </form>
      )}
      {comment.replies && comment.replies.map(reply => (
        <Comment 
          key={reply.id} 
          comment={reply} 
          currentUser={currentUser} 
          onDelete={() => onDelete(reply.id)}
          onReply={(replyText) => onReply(reply.id, replyText)}
        />
      ))}
    </div>
  );
}

export default Comment;
