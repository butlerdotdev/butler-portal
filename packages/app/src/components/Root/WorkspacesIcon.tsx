import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles({
	icon: {
		width: 30,
		height: 30,
		borderRadius: 4,
		objectFit: 'contain',
	},
});

const WorkspacesIcon = () => {
	const classes = useStyles();
	return <img src="/butlerworkspaces.svg" alt="" className={classes.icon} />;
};

export default WorkspacesIcon;
