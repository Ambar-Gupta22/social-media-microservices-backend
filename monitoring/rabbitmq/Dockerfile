FROM rabbitmq:3-management

# Enable prometheus plugin
RUN rabbitmq-plugins enable --offline rabbitmq_prometheus

# Fix .erlang.cookie permissions for Windows Docker
# The cookie file must exist with mode 400 and be owned by rabbitmq user
RUN echo "socialmedia_secret_cookie" > /var/lib/rabbitmq/.erlang.cookie && \
    chown rabbitmq:rabbitmq /var/lib/rabbitmq/.erlang.cookie && \
    chmod 400 /var/lib/rabbitmq/.erlang.cookie
